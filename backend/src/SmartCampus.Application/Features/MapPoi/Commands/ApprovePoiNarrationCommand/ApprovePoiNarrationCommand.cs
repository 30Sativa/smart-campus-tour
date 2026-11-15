using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>
/// Approves a narration draft (ADR-0060). The approver must not be the draft's last editor; the previously approved
/// version becomes SUPERSEDED in the same transaction. There is no automatic or self approval.
/// </summary>
public sealed record ApprovePoiNarrationCommand(Guid ActorUserId, Guid ProposalId, int RevisionNumber, ChangePoiNarrationRequest Request)
    : IPoiMutationCommand<PoiNarrationRevisionView>;

public sealed class ApprovePoiNarrationCommandValidator : AbstractValidator<ApprovePoiNarrationCommand>
{
    public ApprovePoiNarrationCommandValidator()
    {
        RuleFor(command => command.RevisionNumber).GreaterThan(0);
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
    }
}

public sealed class ApprovePoiNarrationCommandHandler(
    IPoiProposalRepository proposalRepository,
    IMapPoiRequestLock requestLock,
    IApplicationDbContext dbContext,
    TimeProvider timeProvider)
    : IRequestHandler<ApprovePoiNarrationCommand, PoiNarrationRevisionView>
{
    public async Task<PoiNarrationRevisionView> Handle(ApprovePoiNarrationCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var requestHash = MapPoiRequestHash.Compute(new
        {
            Operation = "APPROVE", command.ProposalId, command.RevisionNumber, request.ExpectedRowVersion
        });
        await requestLock.LockRequestAsync(command.ActorUserId, request.RequestId, PoiNarrationRules.LockOperation, cancellationToken);
        var replay = await PoiNarrationRules.ReplayAsync(proposalRepository, command.ActorUserId, request.RequestId, requestHash, cancellationToken);
        if (replay is not null) return replay;

        var proposal = await PoiNarrationRules.LockWritableProposalAsync(proposalRepository, command.ProposalId, cancellationToken);
        var draft = await proposalRepository.FindNarrationAsync(proposal.Id, command.RevisionNumber, cancellationToken)
            ?? throw new NotFoundException("POI narration", command.RevisionNumber);
        PoiNarrationRules.EnsureDraft(draft);
        PoiNarrationRules.EnsureRowVersion(draft, request.ExpectedRowVersion);
        if (draft.LastEditedByUserId == command.ActorUserId)
            throw new ConflictException("Bạn là người sửa bản nháp này lần cuối nên không thể tự duyệt. Một Staff khác cần duyệt.",
                PoiNarrationRules.SelfApprovalForbiddenCode);

        var now = timeProvider.GetUtcNow();
        var previous = await proposalRepository.FindNarrationInStateAsync(proposal.Id, PoiNarrationStates.Approved, cancellationToken);
        if (previous is not null)
        {
            previous.State = PoiNarrationStates.Superseded;
            // The filtered unique index allows one APPROVED row per POI at every statement, so the old row leaves first.
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        draft.State = PoiNarrationStates.Approved;
        draft.ApprovedByUserId = command.ActorUserId;
        draft.ApprovedAt = now;
        proposalRepository.Add(PoiNarrationRules.Receipt(command.ActorUserId, request.RequestId, requestHash, "APPROVE", draft.Id, now));
        proposalRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_NARRATION_APPROVED",
            EntityType = "PoiNarrationRevision",
            EntityId = draft.Id.ToString("D"),
            ResultCode = PoiNarrationStates.Approved,
            DataJson = JsonSerializer.Serialize(new
            {
                proposalId = proposal.Id, draft.RevisionNumber, lastEditedByUserId = draft.LastEditedByUserId,
                supersededRevisionNumber = previous?.RevisionNumber
            }),
            OccurredAt = now
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return await PoiNarrationRules.LoadViewAsync(proposalRepository, draft.Id, cancellationToken);
    }
}
