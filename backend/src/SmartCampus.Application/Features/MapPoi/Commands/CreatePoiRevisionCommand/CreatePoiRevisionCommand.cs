using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record CreatePoiRevisionCommand(Guid ActorUserId, Guid ProposalId, CreatePoiRevisionRequest Request)
    : IPoiMutationCommand<PoiProposalView>;

public sealed class CreatePoiRevisionCommandValidator : AbstractValidator<CreatePoiRevisionCommand>
{
    public CreatePoiRevisionCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedCurrentRevision).GreaterThan(0);
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
        RuleFor(command => command.Request.Draft.MapVersionId).NotEmpty();
        MapPoiValidationRules.AddDraftRules(RuleFor(command => command.Request.Draft));
    }
}

public sealed class CreatePoiRevisionCommandHandler(
    IMapVersionRepository mapRepository,
    IPoiProposalRepository proposalRepository,
    IPoiVerificationRepository verificationRepository,
    IMapPoiRequestLock requestLock,
    IApplicationDbContext dbContext,
    TimeProvider timeProvider)
    : IRequestHandler<CreatePoiRevisionCommand, PoiProposalView>
{
    public async Task<PoiProposalView> Handle(CreatePoiRevisionCommand command, CancellationToken cancellationToken)
    {
        var draft = MapPoiValidationRules.Normalize(command.Request.Draft);
        var contentHash = MapPoiRequestHash.Compute(draft);
        await requestLock.LockRequestAsync(command.ActorUserId, command.Request.RequestId, $"poi-revision:{command.ProposalId:D}", cancellationToken);
        var priorRevision = await proposalRepository.FindRevisionRequestAsync(command.ProposalId, command.Request.RequestId, cancellationToken);
        if (priorRevision is not null)
        {
            MapPoiRequestIdempotency.EnsureSameRequest(priorRevision.RequestHash, contentHash);
            var priorProposal = await proposalRepository.FindProposalAsync(command.ProposalId, cancellationToken)
                ?? throw new NotFoundException("POI proposal", command.ProposalId);
            return await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, priorProposal,
                await proposalRepository.FindCurrentRevisionAsync(command.ProposalId, cancellationToken) ?? priorRevision, cancellationToken);
        }

        var proposal = await proposalRepository.LockProposalAsync(command.ProposalId, cancellationToken)
            ?? throw new NotFoundException("POI proposal", command.ProposalId);
        PoiProposalRules.EnsureCurrent(proposal, command.Request.ExpectedCurrentRevision, command.Request.ExpectedRowVersion);
        var previous = await proposalRepository.FindCurrentRevisionAsync(proposal.Id, cancellationToken)
            ?? throw new ConflictException("The proposal's current revision is missing.");
        var submission = await proposalRepository.FindSubmissionAsync(previous.Id, cancellationToken);
        var priorResult = await verificationRepository.FindVerificationAsync(previous.Id, cancellationToken);
        if (submission is not null && priorResult is null)
        {
            var effectiveResult = await verificationRepository.FindLatestVerificationByFingerprintAsync(
                proposal.Id, previous.NavigationFingerprint, cancellationToken);
            if (effectiveResult?.ResultCode != "PASS")
                throw new ConflictException("A submitted POI revision must have a current passing result for its exact navigation fingerprint before it can be edited.");
        }

        var map = await mapRepository.FindMapVersionAsync(draft.MapVersionId, includePackage: true, cancellationToken)
            ?? throw new NotFoundException("Map version", draft.MapVersionId);
        PoiProposalRules.ValidatePosition(map, draft);
        var now = timeProvider.GetUtcNow();
        var nextNumber = proposal.CurrentRevision + 1;
        var revision = PoiProposalRules.CreateRevision(proposal.Id, nextNumber,
            command.ActorUserId, command.Request.RequestId, contentHash, draft, now);
        revision.MapVersion = map;
        proposal.CurrentRevision = nextNumber;
        proposal.UpdatedAt = now;
        proposalRepository.Add(revision);
        proposalRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_PROPOSAL_REVISION_CREATED",
            EntityType = "PoiProposal",
            EntityId = proposal.Id.ToString("D"),
            ResultCode = "DRAFT",
            DataJson = JsonSerializer.Serialize(new { revision = nextNumber, mapVersionId = map.Id, movementChanged = !CryptographicOperations.FixedTimeEquals(previous.NavigationFingerprint, revision.NavigationFingerprint) }),
            OccurredAt = now
        });
        // The caller needs the new SQL rowversion for its next optimistic update.
        await dbContext.SaveChangesAsync(cancellationToken);
        return await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, proposal, revision, cancellationToken);
    }


}
