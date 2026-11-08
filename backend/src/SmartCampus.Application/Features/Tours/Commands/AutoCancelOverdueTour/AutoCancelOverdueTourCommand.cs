using System.Text.Json;
using MediatR;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.AutoCancelOverdueTour;

/// <summary>SCHEDULED/READY Tours whose robot hold looks over, unlocked. Each is decided again under its Tour lock.</summary>
public sealed record ListOverdueUnstartedToursQuery : IQuery<IReadOnlyList<Guid>>;

/// <summary>One Tour in its own transaction (ADR-0047). Safe to rerun and to race Staff Start/Cancel: the rule is decided under the lock.</summary>
public sealed record AutoCancelOverdueTourCommand(Guid TourId) : ITourMutationCommand<AutoCancelOutcome>;

public enum AutoCancelOutcome { Skipped, Cancelled, CancelledWithoutNotice }


public sealed class ListOverdueUnstartedToursQueryHandler(ITourManagementRepository repository, FleetCommandSettings settings, TimeProvider clock)
    : IRequestHandler<ListOverdueUnstartedToursQuery, IReadOnlyList<Guid>>
{
    public Task<IReadOnlyList<Guid>> Handle(ListOverdueUnstartedToursQuery query, CancellationToken ct) =>
        repository.ListOverdueUnstartedTourIdsAsync(clock.GetUtcNow(), settings.StartLateLimit, ct);
}

public sealed class AutoCancelOverdueTourCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IInvitationRepository invitations, InvitationSettings invitationSettings, FleetCommandSettings settings, TimeProvider clock,
    ILogger<AutoCancelOverdueTourCommandHandler> logger) : IRequestHandler<AutoCancelOverdueTourCommand, AutoCancelOutcome>
{
    public async Task<AutoCancelOutcome> Handle(AutoCancelOverdueTourCommand command, CancellationToken ct)
    {
        // The same Tour root lock Staff Start and Cancel take first; whoever gets it second sees the other's result.
        if (await registrations.LockTourAsync(command.TourId, ct) is not { } tour) return AutoCancelOutcome.Skipped;
        if (!TourPreparation.Permissions(tour, await repository.GetUsageAsync(tour.Id, ct)).CanCancel) return AutoCancelOutcome.Skipped;
        var now = clock.GetUtcNow();
        var reservation = await repository.FindActiveReservationAsync(tour.Id, ct);
        var holdEndsAt = TourAutoCancel.HoldEndsAt(tour.ScheduledStartAt, reservation?.EndsAt, settings.StartLateLimit);
        if (holdEndsAt > now) return AutoCancelOutcome.Skipped;

        var notified = await TourCancellation.ApplyAsync(repository, invitations, tour, null, TourAutoCancel.Reason, now, ct);
        var backlog = now - holdEndsAt > TourAutoCancel.NoticeCutoff;
        repository.AddAudit(new AuditLog
        {
            TourId = tour.Id, ActorUserId = null, CorrelationId = Guid.NewGuid(), EntityType = "Tour", EntityId = tour.Id.ToString("D"),
            Action = "TOUR_CANCELLED", ResultCode = TourAutoCancel.ResultCode, OccurredAt = now,
            DataJson = JsonSerializer.Serialize(new
            {
                source = "SYSTEM", holdEndsAt, notice = notified.Count == 0 ? "NONE" : backlog ? "SKIPPED_BACKLOG" : "QUEUED",
                changedFields = new[] { "state", "endedAt", "endReason", "pendingRegistrations", "invitationAccess" }
            })
        });
        if (backlog) return AutoCancelOutcome.CancelledWithoutNotice;
        TourCancellation.QueueNotice(repository, invitationSettings, logger, tour.Id, null, notified, now);
        return AutoCancelOutcome.Cancelled;
    }
}
