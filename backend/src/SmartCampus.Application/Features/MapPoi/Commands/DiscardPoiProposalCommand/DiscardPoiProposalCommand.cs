using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>
/// Hides a POI proposal that never passed technical verification (ADR-0051). Nothing is deleted: revisions,
/// submissions, results and import receipts stay as history. Without a PASS the proposal cannot be in any Route.
/// </summary>
public sealed record DiscardPoiProposalCommand(Guid ActorUserId, Guid ProposalId, DiscardPoiProposalRequest Request)
    : IPoiMutationCommand<PoiProposalView>;

public sealed class DiscardPoiProposalCommandValidator : AbstractValidator<DiscardPoiProposalCommand>
{
    public DiscardPoiProposalCommandValidator()
    {
        RuleFor(command => command.Request.ExpectedRevisionNumber).GreaterThan(0);
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
    }
}

public sealed class DiscardPoiProposalCommandHandler(
    IPoiProposalRepository proposalRepository,
    IPoiVerificationRepository verificationRepository,
    IApplicationDbContext dbContext,
    TimeProvider timeProvider)
    : IRequestHandler<DiscardPoiProposalCommand, PoiProposalView>
{
    public async Task<PoiProposalView> Handle(DiscardPoiProposalCommand command, CancellationToken cancellationToken)
    {
        // The same row lock as revise, submit, verify and import, so none of them can interleave with this check.
        var proposal = await proposalRepository.LockProposalAsync(command.ProposalId, cancellationToken)
            ?? throw new NotFoundException("POI proposal", command.ProposalId);
        var revision = await proposalRepository.FindCurrentRevisionAsync(proposal.Id, cancellationToken)
            ?? throw new ConflictException("The proposal's current revision is missing.");
        // A retried discard returns the same result instead of a stale-version conflict.
        if (proposal.DiscardedAt is not null)
            return await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, proposal, revision, cancellationToken);

        PoiProposalRules.EnsureCurrent(proposal, command.Request.ExpectedRevisionNumber, command.Request.ExpectedRowVersion);
        var results = await verificationRepository.ListVerificationRecordsAsync([proposal.Id], cancellationToken);
        if (!PoiProposalRules.CanDiscard(results))
            throw new ConflictException(
                "POI đã từng đạt kiểm chứng nên không thể xoá: tuyến có thể đang dùng một phiên bản của POI này.",
                PoiProposalRules.HasPassCode);

        var now = timeProvider.GetUtcNow();
        proposal.DiscardedAt = now;
        proposal.DiscardedByUserId = command.ActorUserId;
        proposal.UpdatedAt = now;
        proposalRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_PROPOSAL_DISCARDED",
            EntityType = "PoiProposal",
            EntityId = proposal.Id.ToString("D"),
            ResultCode = "DISCARDED",
            DataJson = JsonSerializer.Serialize(new { revision = proposal.CurrentRevision, sourcePoiId = proposal.SourcePoiId }),
            OccurredAt = now
        });
        // The caller needs the new SQL rowversion in the returned view.
        await dbContext.SaveChangesAsync(cancellationToken);
        return await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, proposal, revision, cancellationToken);
    }
}
