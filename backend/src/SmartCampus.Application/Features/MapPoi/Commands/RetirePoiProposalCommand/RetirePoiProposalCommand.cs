using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>
/// "Ngưng dùng" for a POI that once passed and that a route revision uses, so it cannot be discarded (ADR-0062).
/// Saved routes and Tours keep their stops; the POI takes no new revision, submission, result, narration change or
/// import, leaves the verification queue, and SaveRouteRevision refuses it until it is reactivated.
/// </summary>
public sealed record RetirePoiProposalCommand(Guid ActorUserId, Guid ProposalId, ChangePoiProposalLifecycleRequest Request)
    : IPoiMutationCommand<PoiProposalView>;

/// <summary>"Dùng lại" lifts only the retirement; nothing else changes.</summary>
public sealed record ReactivatePoiProposalCommand(Guid ActorUserId, Guid ProposalId, ChangePoiProposalLifecycleRequest Request)
    : IPoiMutationCommand<PoiProposalView>;

public sealed class RetirePoiProposalCommandValidator : AbstractValidator<RetirePoiProposalCommand>
{
    public RetirePoiProposalCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
    }
}

public sealed class ReactivatePoiProposalCommandValidator : AbstractValidator<ReactivatePoiProposalCommand>
{
    public ReactivatePoiProposalCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
    }
}

public sealed class RetirePoiProposalCommandHandler(
    IPoiProposalRepository proposalRepository,
    IPoiVerificationRepository verificationRepository,
    IMapPoiRequestLock requestLock,
    IApplicationDbContext dbContext,
    TimeProvider timeProvider)
    : IRequestHandler<RetirePoiProposalCommand, PoiProposalView>
{
    public Task<PoiProposalView> Handle(RetirePoiProposalCommand command, CancellationToken cancellationToken) =>
        PoiLifecycleChange.ApplyAsync(proposalRepository, verificationRepository, requestLock, dbContext, timeProvider,
            command.ActorUserId, command.ProposalId, command.Request, retire: true, cancellationToken);
}

public sealed class ReactivatePoiProposalCommandHandler(
    IPoiProposalRepository proposalRepository,
    IPoiVerificationRepository verificationRepository,
    IMapPoiRequestLock requestLock,
    IApplicationDbContext dbContext,
    TimeProvider timeProvider)
    : IRequestHandler<ReactivatePoiProposalCommand, PoiProposalView>
{
    public Task<PoiProposalView> Handle(ReactivatePoiProposalCommand command, CancellationToken cancellationToken) =>
        PoiLifecycleChange.ApplyAsync(proposalRepository, verificationRepository, requestLock, dbContext, timeProvider,
            command.ActorUserId, command.ProposalId, command.Request, retire: false, cancellationToken);
}

internal static class PoiLifecycleChange
{
    public const string LockOperation = "poi-lifecycle";

    public static async Task<PoiProposalView> ApplyAsync(
        IPoiProposalRepository proposalRepository, IPoiVerificationRepository verificationRepository,
        IMapPoiRequestLock requestLock, IApplicationDbContext dbContext, TimeProvider timeProvider,
        Guid actorUserId, Guid proposalId, ChangePoiProposalLifecycleRequest request, bool retire,
        CancellationToken cancellationToken)
    {
        await requestLock.LockRequestAsync(actorUserId, request.RequestId, LockOperation, cancellationToken);
        // The same row lock as revise, submit, verify, import, narration, discard and SaveRouteRevision.
        var proposal = await proposalRepository.LockProposalAsync(proposalId, cancellationToken)
            ?? throw new NotFoundException("POI proposal", proposalId);
        var revision = await proposalRepository.FindCurrentRevisionAsync(proposal.Id, cancellationToken)
            ?? throw new ConflictException("The proposal's current revision is missing.");
        PoiProposalRules.EnsureNotDiscarded(proposal);
        // Like discard: a retry of a change that already took effect returns the same result, not STALE_VERSION.
        if ((proposal.RetiredAt is not null) == retire)
            return await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, proposal, revision, cancellationToken);
        if (!proposal.RowVersion.AsSpan().SequenceEqual(PoiProposalRowVersion.Decode(request.ExpectedRowVersion)))
            throw new ConflictException("POI vừa được người khác thay đổi. Tải lại rồi thử lại.", "STALE_VERSION");

        if (retire)
        {
            var hasPass = PoiProposalRules.HasPass(
                await verificationRepository.ListVerificationRecordsAsync([proposal.Id], cancellationToken));
            var usedInRoute = (await proposalRepository.ListProposalsUsedInRoutesAsync([proposal.Id], cancellationToken))
                .Contains(proposal.Id);
            if (!PoiProposalRules.CanRetire(proposal, hasPass, usedInRoute))
                throw new ConflictException(
                    hasPass
                        ? "POI này chưa nằm trong tuyến nào nên không cần ngưng dùng. Dùng \"Xoá điểm\" để xoá khỏi danh sách."
                        : "POI chưa từng đạt kiểm chứng nên không cần ngưng dùng. Dùng \"Xoá điểm\" để xoá khỏi danh sách.",
                    PoiProposalRules.NotRetirableCode);
        }

        var now = timeProvider.GetUtcNow();
        proposal.RetiredAt = retire ? now : null;
        proposal.RetiredByUserId = retire ? actorUserId : null;
        proposal.UpdatedAt = now;
        proposalRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = actorUserId,
            Action = retire ? PoiProposalRules.RetiredAudit : PoiProposalRules.ReactivatedAudit,
            EntityType = "PoiProposal",
            EntityId = proposal.Id.ToString("D"),
            ResultCode = retire ? "RETIRED" : "REACTIVATED",
            DataJson = JsonSerializer.Serialize(new { revision = proposal.CurrentRevision, requestId = request.RequestId }),
            OccurredAt = now
        });
        // The caller needs the new SQL rowversion in the returned view.
        await dbContext.SaveChangesAsync(cancellationToken);
        return await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, proposal, revision, cancellationToken);
    }
}
