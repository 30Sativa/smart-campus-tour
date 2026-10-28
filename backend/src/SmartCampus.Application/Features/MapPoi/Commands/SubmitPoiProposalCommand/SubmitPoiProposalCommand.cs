using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record SubmitPoiProposalCommand(Guid ActorUserId, Guid ProposalId, SubmitPoiProposalRequest Request)
    : IPoiMutationCommand<PoiProposalView>;

public sealed class SubmitPoiProposalCommandValidator : AbstractValidator<SubmitPoiProposalCommand>
{
    public SubmitPoiProposalCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedRevisionNumber).GreaterThan(0);
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
    }
}

public sealed class SubmitPoiProposalCommandHandler(
    IMapVersionRepository mapRepository,
    IPoiProposalRepository proposalRepository,
    IPoiVerificationRepository verificationRepository,
    IMapPoiRequestLock requestLock,
    IApplicationDbContext dbContext,
    TimeProvider timeProvider)
    : IRequestHandler<SubmitPoiProposalCommand, PoiProposalView>
{
    public async Task<PoiProposalView> Handle(SubmitPoiProposalCommand command, CancellationToken cancellationToken)
    {
        var requestHash = MapPoiRequestHash.Compute(new { command.ProposalId, command.Request.ExpectedRevisionNumber });
        await requestLock.LockRequestAsync(command.ActorUserId, command.Request.RequestId, $"poi-submit:{command.ProposalId:D}", cancellationToken);
        var priorSubmission = await proposalRepository.FindSubmissionRequestAsync(command.ActorUserId, command.Request.RequestId, cancellationToken);
        if (priorSubmission is not null)
        {
            MapPoiRequestIdempotency.EnsureSameRequest(priorSubmission.RequestHash, requestHash);
            var proposalPrior = await proposalRepository.FindProposalAsync(command.ProposalId, cancellationToken)
                ?? throw new NotFoundException("POI proposal", command.ProposalId);
            return await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, proposalPrior,
                await proposalRepository.FindCurrentRevisionAsync(command.ProposalId, cancellationToken) ?? throw new ConflictException("The proposal has no current revision."),
                cancellationToken);
        }

        var proposal = await proposalRepository.LockProposalAsync(command.ProposalId, cancellationToken)
            ?? throw new NotFoundException("POI proposal", command.ProposalId);
        PoiProposalRules.EnsureCurrent(proposal, command.Request.ExpectedRevisionNumber, command.Request.ExpectedRowVersion);
        var revision = await proposalRepository.FindCurrentRevisionAsync(proposal.Id, cancellationToken)
            ?? throw new ConflictException("The proposal's current revision is missing.");
        if (await proposalRepository.FindSubmissionAsync(revision.Id, cancellationToken) is not null)
            throw new ConflictException("This POI revision has already been submitted.");

        var map = await mapRepository.FindMapVersionAsync(revision.MapVersionId, includePackage: false, cancellationToken)
            ?? throw new NotFoundException("Map version", revision.MapVersionId);
        await mapRepository.LockMapPreparationStateAsync(map.Id, cancellationToken);
        (await MapPreparationEligibility.LoadAsync(mapRepository, map, cancellationToken)).EnsureCanUse();

        var now = timeProvider.GetUtcNow();
        var submission = new PoiProposalSubmission
        {
            Id = Guid.NewGuid(),
            ProposalRevisionId = revision.Id,
            SubmittedByUserId = command.ActorUserId,
            RequestId = command.Request.RequestId,
            RequestHash = requestHash,
            SubmittedAt = now
        };
        proposalRepository.Add(submission);
        proposalRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_PROPOSAL_SUBMITTED",
            EntityType = "PoiProposalRevision",
            EntityId = revision.Id.ToString("D"),
            ResultCode = "SUBMITTED",
            DataJson = JsonSerializer.Serialize(new { revision.ProposalId, revision.RevisionNumber, revision.MapVersionId }),
            OccurredAt = now
        });
        // Submission changes the proposal rowversion returned to the caller.
        await dbContext.SaveChangesAsync(cancellationToken);
        return await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, proposal, revision, cancellationToken);
    }
}
