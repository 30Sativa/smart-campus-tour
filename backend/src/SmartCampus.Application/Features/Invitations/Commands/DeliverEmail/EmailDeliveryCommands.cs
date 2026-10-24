using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Invitations.Commands.DeliverEmail;

public sealed record ClaimEmailCommand(Guid AttemptId, bool Interrupted) : IRegistrationMutationCommand<InvitationEmail?>;
public sealed record RecordEmailResultCommand(Guid AttemptId, string Status, string Code) : IRegistrationMutationCommand<Unit>;
public sealed class ClaimEmailCommandHandler(IInvitationRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<ClaimEmailCommand, InvitationEmail?>
{
    public async Task<InvitationEmail?> Handle(ClaimEmailCommand command, CancellationToken ct)
    {
        var request = await repository.GetAttemptAsync(command.AttemptId, ct);
        if (request is null) return null;
        var tour = await registrations.LockTourAsync(request.TourId!.Value, ct);
        if (await repository.HasResultAsync(command.AttemptId, ct)) return null;
        var started = await repository.HasStartedAsync(command.AttemptId, ct);
        var now = clock.GetUtcNow();
        if (command.Interrupted)
        {
            if (started) repository.AddAudit(InvitationAudit.Create(request.TourId.Value, request.ActorUserId,
                InvitationAudit.Result, request.EntityId, command.AttemptId, now, "UNKNOWN", new { code = "INTERRUPTED" }));
            return null;
        }
        if (started || tour is null) return null;
        // Read only after owning the Tour lock, shared by every access mutation.
        return await ClaimAsync(request, tour, now, ct);
    }
    private async Task<InvitationEmail?> ClaimAsync(AuditLog request, Tour tour, DateTimeOffset now, CancellationToken ct)
    {
        var invitation = await repository.FindInvitationAsync(Guid.Parse(request.EntityId), ct);
        if (invitation is null || !InvitationPolicy.CanSend(tour, invitation.RosterRow.Registration, invitation, now) ||
            invitation.AccessVersion != InvitationAudit.Version(request))
        {
            repository.AddAudit(InvitationAudit.Create(tour.Id, request.ActorUserId, InvitationAudit.Result,
                request.EntityId, request.CorrelationId!.Value, now, "FAILED", new { code = "ACCESS_UNAVAILABLE" }));
            return null;
        }
        repository.AddAudit(InvitationAudit.Create(tour.Id, request.ActorUserId, InvitationAudit.Started,
            request.EntityId, request.CorrelationId!.Value, now, "PENDING"));
        return new(tour.Id, invitation.Id, request.CorrelationId.Value, invitation.RosterRow.Email, tour.Name, tour.ScheduledStartAt,
            invitation.ExpiresAt, invitation.AccessVersion, invitation.AccessCodeProtected);
    }
}
public sealed class RecordEmailResultCommandHandler(IInvitationRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<RecordEmailResultCommand, Unit>
{
    public async Task<Unit> Handle(RecordEmailResultCommand command, CancellationToken ct)
    {
        var request = await repository.GetAttemptAsync(command.AttemptId, ct);
        if (request is null) return Unit.Value;
        _ = await registrations.LockTourAsync(request.TourId!.Value, ct);
        if (!await repository.HasResultAsync(command.AttemptId, ct))
            repository.AddAudit(InvitationAudit.Create(request.TourId.Value, request.ActorUserId, InvitationAudit.Result,
                request.EntityId, command.AttemptId, clock.GetUtcNow(), command.Status, new { code = command.Code }));
        return Unit.Value;
    }
}
