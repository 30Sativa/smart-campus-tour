using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.Invitations.Commands.DeliverEmail;

public sealed record ClaimRevokeNoticeCommand(Guid AttemptId, bool Interrupted) : IRegistrationMutationCommand<InvitationRevokedEmail?>;
public sealed record RecordRevokeNoticeResultCommand(Guid AttemptId, string Status, string Code) : IRegistrationMutationCommand<Unit>;

public sealed class ClaimRevokeNoticeCommandHandler(IInvitationRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<ClaimRevokeNoticeCommand, InvitationRevokedEmail?>
{
    public async Task<InvitationRevokedEmail?> Handle(ClaimRevokeNoticeCommand command, CancellationToken ct)
    {
        var request = await repository.GetRevokeNoticeAsync(command.AttemptId, ct);
        if (request is null) return null;
        var tour = await registrations.LockTourAsync(request.TourId!.Value, ct);
        if (await repository.HasRevokeNoticeResultAsync(command.AttemptId, ct)) return null;
        var started = await repository.HasRevokeNoticeStartedAsync(command.AttemptId, ct);
        var now = clock.GetUtcNow();
        if (command.Interrupted)
        {
            // It may already be out, so it is reported and never sent twice.
            if (started) repository.AddAudit(Audit(request.TourId.Value, request, "UNKNOWN", "INTERRUPTED", now));
            return null;
        }
        if (started || tour is null) return null;
        // Read only after owning the Tour lock: a reissue in between restores access, and then the notice is obsolete.
        var invitation = await repository.FindInvitationAsync(Guid.Parse(request.EntityId), ct);
        if (invitation is null || invitation.RevokedAt is null || invitation.AccessVersion != InvitationAudit.Version(request))
        {
            repository.AddAudit(Audit(tour.Id, request, "SKIPPED", "ACCESS_RESTORED", now));
            return null;
        }
        repository.AddAudit(InvitationAudit.Create(tour.Id, request.ActorUserId, InvitationRevokeNotice.Started,
            request.EntityId, command.AttemptId, now, "PENDING"));
        var row = invitation.RosterRow;
        return new(tour.Id, invitation.Id, command.AttemptId, row.Email.Trim(), tour.Name, tour.ScheduledStartAt,
            row.DisplayName, row.RowType == "SHARED_VIEWING");
    }

    internal static Domain.Entities.AuditLog Audit(Guid tourId, Domain.Entities.AuditLog request, string status, string code, DateTimeOffset now) =>
        InvitationAudit.Create(tourId, request.ActorUserId, InvitationRevokeNotice.Result, request.EntityId,
            request.CorrelationId!.Value, now, status, new { code });
}

public sealed class RecordRevokeNoticeResultCommandHandler(IInvitationRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<RecordRevokeNoticeResultCommand, Unit>
{
    public async Task<Unit> Handle(RecordRevokeNoticeResultCommand command, CancellationToken ct)
    {
        var request = await repository.GetRevokeNoticeAsync(command.AttemptId, ct);
        if (request is null) return Unit.Value;
        _ = await registrations.LockTourAsync(request.TourId!.Value, ct);
        if (!await repository.HasRevokeNoticeResultAsync(command.AttemptId, ct))
            repository.AddAudit(ClaimRevokeNoticeCommandHandler.Audit(request.TourId.Value, request, command.Status, command.Code, clock.GetUtcNow()));
        return Unit.Value;
    }
}
