using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>Drops a narration draft without approving it (ADR-0060). The row stays as history.</summary>
public sealed record DiscardPoiNarrationCommand(Guid ActorUserId, Guid ProposalId, int RevisionNumber, ChangePoiNarrationRequest Request)
    : IPoiMutationCommand<PoiNarrationRevisionView>;

public sealed class DiscardPoiNarrationCommandValidator : AbstractValidator<DiscardPoiNarrationCommand>
{
    public DiscardPoiNarrationCommandValidator()
    {
        RuleFor(command => command.RevisionNumber).GreaterThan(0);
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
    }
}

public sealed class DiscardPoiNarrationCommandHandler(
    IPoiProposalRepository proposalRepository,
    IMapPoiRequestLock requestLock,
    IApplicationDbContext dbContext,
    TimeProvider timeProvider)
    : IRequestHandler<DiscardPoiNarrationCommand, PoiNarrationRevisionView>
{
    public async Task<PoiNarrationRevisionView> Handle(DiscardPoiNarrationCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var requestHash = MapPoiRequestHash.Compute(new
        {
            Operation = "DISCARD", command.ProposalId, command.RevisionNumber, request.ExpectedRowVersion
        });
        await requestLock.LockRequestAsync(command.ActorUserId, request.RequestId, PoiNarrationRules.LockOperation, cancellationToken);
        var replay = await PoiNarrationRules.ReplayAsync(proposalRepository, command.ActorUserId, request.RequestId, requestHash, cancellationToken);
        if (replay is not null) return replay;

        var proposal = await PoiNarrationRules.LockWritableProposalAsync(proposalRepository, command.ProposalId, cancellationToken);
        var draft = await proposalRepository.FindNarrationAsync(proposal.Id, command.RevisionNumber, cancellationToken)
            ?? throw new NotFoundException("POI narration", command.RevisionNumber);
        PoiNarrationRules.EnsureDraft(draft);
        PoiNarrationRules.EnsureRowVersion(draft, request.ExpectedRowVersion);

        var now = timeProvider.GetUtcNow();
        draft.State = PoiNarrationStates.Discarded;
        proposalRepository.Add(PoiNarrationRules.Receipt(command.ActorUserId, request.RequestId, requestHash, "DISCARD", draft.Id, now));
        proposalRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_NARRATION_DISCARDED",
            EntityType = "PoiNarrationRevision",
            EntityId = draft.Id.ToString("D"),
            ResultCode = PoiNarrationStates.Discarded,
            DataJson = JsonSerializer.Serialize(new { proposalId = proposal.Id, draft.RevisionNumber }),
            OccurredAt = now
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return await PoiNarrationRules.LoadViewAsync(proposalRepository, draft.Id, cancellationToken);
    }
}
