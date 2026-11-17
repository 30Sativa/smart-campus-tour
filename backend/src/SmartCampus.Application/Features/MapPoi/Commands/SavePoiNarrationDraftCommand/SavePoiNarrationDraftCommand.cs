using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>
/// Creates the narration draft of a POI or edits it in place (ADR-0060). Narration does not depend on the POI's
/// technical result: any POI that exists and is not discarded can have one.
/// </summary>
public sealed record SavePoiNarrationDraftCommand(Guid ActorUserId, Guid ProposalId, SavePoiNarrationDraftRequest Request)
    : IPoiMutationCommand<PoiNarrationRevisionView>;

public sealed class SavePoiNarrationDraftCommandValidator : AbstractValidator<SavePoiNarrationDraftCommand>
{
    public SavePoiNarrationDraftCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        PoiNarrationRules.AddTextRules(RuleFor(command => command.Request));
    }
}

public sealed class SavePoiNarrationDraftCommandHandler(
    IPoiProposalRepository proposalRepository,
    IMapPoiRequestLock requestLock,
    IApplicationDbContext dbContext,
    TimeProvider timeProvider)
    : IRequestHandler<SavePoiNarrationDraftCommand, PoiNarrationRevisionView>
{
    public async Task<PoiNarrationRevisionView> Handle(SavePoiNarrationDraftCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var text = request.NarrationText.Trim();
        // A POI narration carries no fallback video any more; the request field is ignored and the column kept NULL.
        string? videoUrl = null;
        var requestHash = MapPoiRequestHash.Compute(new
        {
            Operation = "DRAFT", command.ProposalId, request.ExpectedRowVersion, text, videoUrl
        });
        await requestLock.LockRequestAsync(command.ActorUserId, request.RequestId, PoiNarrationRules.LockOperation, cancellationToken);
        var replay = await PoiNarrationRules.ReplayAsync(proposalRepository, command.ActorUserId, request.RequestId, requestHash, cancellationToken);
        if (replay is not null) return replay;

        var proposal = await PoiNarrationRules.LockWritableProposalAsync(proposalRepository, command.ProposalId, cancellationToken);
        var draft = await proposalRepository.FindNarrationInStateAsync(proposal.Id, PoiNarrationStates.Draft, cancellationToken);
        var now = timeProvider.GetUtcNow();
        string operation;
        if (draft is null)
        {
            // The caller expected a draft that has since been approved or discarded.
            if (request.ExpectedRowVersion is not null) throw PoiNarrationRules.StaleVersion();
            operation = "CREATE";
            draft = new PoiNarrationRevision
            {
                Id = Guid.NewGuid(),
                ProposalId = proposal.Id,
                RevisionNumber = await proposalRepository.GetLastNarrationNumberAsync(proposal.Id, cancellationToken) + 1,
                NarrationText = text,
                FallbackVideoUrl = videoUrl,
                State = PoiNarrationStates.Draft,
                CreatedByUserId = command.ActorUserId,
                CreatedAt = now,
                LastEditedByUserId = command.ActorUserId,
                LastEditedAt = now
            };
            proposalRepository.Add(draft);
        }
        else
        {
            // Editing needs the version the editor saw, so two Staff never overwrite each other silently.
            if (request.ExpectedRowVersion is null) throw PoiNarrationRules.StaleVersion();
            PoiNarrationRules.EnsureRowVersion(draft, request.ExpectedRowVersion);
            operation = "EDIT";
            draft.NarrationText = text;
            draft.FallbackVideoUrl = videoUrl;
            draft.LastEditedByUserId = command.ActorUserId;
            draft.LastEditedAt = now;
        }

        proposalRepository.Add(PoiNarrationRules.Receipt(command.ActorUserId, request.RequestId, requestHash, operation, draft.Id, now));
        proposalRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = operation == "CREATE" ? "POI_NARRATION_DRAFT_CREATED" : "POI_NARRATION_DRAFT_EDITED",
            EntityType = "PoiNarrationRevision",
            EntityId = draft.Id.ToString("D"),
            ResultCode = PoiNarrationStates.Draft,
            DataJson = JsonSerializer.Serialize(new { proposalId = proposal.Id, draft.RevisionNumber, length = text.Length, hasVideo = videoUrl is not null }),
            OccurredAt = now
        });
        // The caller needs the new SQL rowversion and the editor's name in the returned view.
        await dbContext.SaveChangesAsync(cancellationToken);
        return await PoiNarrationRules.LoadViewAsync(proposalRepository, draft.Id, cancellationToken);
    }
}
