using System.Text.Json;
using MediatR;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.ExpirePendingDecisions;

/// <summary>Tours past T-24h with undecided items, unlocked. Each is decided again under its Tour lock.</summary>
public sealed record ListToursWithExpirableDecisionsQuery : IQuery<IReadOnlyList<Guid>>;

/// <summary>One Tour in its own transaction (BR-05, ADR-0048). A second run finds nothing left to change.</summary>
public sealed record ExpirePendingDecisionsCommand(Guid TourId) : ITourMutationCommand<int>;

public sealed class ListToursWithExpirableDecisionsQueryHandler(ITourManagementRepository repository, TimeProvider clock)
    : IRequestHandler<ListToursWithExpirableDecisionsQuery, IReadOnlyList<Guid>>
{
    public Task<IReadOnlyList<Guid>> Handle(ListToursWithExpirableDecisionsQuery query, CancellationToken ct) =>
        repository.ListToursWithExpirableDecisionsAsync(clock.GetUtcNow(), ct);
}

public sealed class ExpirePendingDecisionsCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    InvitationSettings invitationSettings, TimeProvider clock, ILogger<ExpirePendingDecisionsCommandHandler> logger)
    : IRequestHandler<ExpirePendingDecisionsCommand, int>
{
    public async Task<int> Handle(ExpirePendingDecisionsCommand command, CancellationToken ct)
    {
        // The Tour root lock every registration writer takes first, so a Staff decision and this job never interleave.
        if (await registrations.LockTourAsync(command.TourId, ct) is not { } tour || tour.State is not ("SCHEDULED" or "READY")) return 0;
        // A short-notice Tour has no T-24h; what Staff leaves undecided blocks READY (ADR-0050).
        if (tour.IsShortNotice) return 0;
        var now = clock.GetUtcNow();
        if (now < tour.ScheduledStartAt - TourSchedule.PendingDecisionClose) return 0;

        var rows = await repository.LoadPendingRowsAsync(tour.Id, ct);
        var emailChanges = await repository.LoadPendingEmailChangesAsync(tour.Id, ct);
        if (rows.Count + emailChanges.Count == 0) return 0;
        foreach (var row in rows)
        {
            row.ParticipationState = RosterParticipationStates.Expired;
            row.UpdatedAt = now;
        }
        // Only the request closes: the row keeps its email and invitation.
        foreach (var request in emailChanges) request.State = RosterParticipationStates.Expired;
        foreach (var group in rows.GroupBy(row => row.Registration)) ApplyRegistrationState(group.Key, group.Count(), now);

        var items = rows.Select(row => row.RegistrationId).Concat(emailChanges.Select(request => request.RosterRow.RegistrationId)).Distinct()
            .Select(id => new RosterExpiryNoticeItem(id, rows.Count(row => row.RegistrationId == id),
                emailChanges.Count(request => request.RosterRow.RegistrationId == id))).ToArray();
        repository.AddAudit(new AuditLog
        {
            TourId = tour.Id, ActorUserId = null, CorrelationId = Guid.NewGuid(), EntityType = "Tour", EntityId = tour.Id.ToString("D"),
            Action = RosterExpiryNoticeAudit.Expired, ResultCode = "SYSTEM", OccurredAt = now,
            DataJson = JsonSerializer.Serialize(new { expiredRows = rows.Count, expiredEmailChanges = emailChanges.Count, registrations = items.Length })
        });
        if (invitationSettings.Enabled) repository.AddAudit(RosterExpiryNoticeAudit.Request(tour.Id, items, now));
        else
        {
            logger.LogWarning("Pending items of Tour {TourId} expired but email is disabled, so {RecipientCount} representatives were not notified.", tour.Id, items.Length);
            repository.AddAudit(TourCancelNoticeAudit.Create(tour.Id, null, RosterExpiryNoticeAudit.Failed, Guid.NewGuid(), now, "FAILED",
                new { code = "EMAIL_DISABLED", recipientCount = items.Length }));
        }
        return rows.Count + emailChanges.Count;
    }

    private void ApplyRegistrationState(GroupRegistration registration, int expiredRows, DateTimeOffset now)
    {
        var state = RegistrationStates.FromRows(registration.RosterRows);
        if (state == registration.State) return;
        registration.State = state;
        registration.UpdatedAt = now;
        if (state == RegistrationStates.Rejected)
        {
            registration.RejectionReason = RegistrationExpiry.Reason;
            registration.ReviewedByUserId = null;
            registration.ReviewedAt = now;
        }
        repository.AddAudit(new AuditLog
        {
            TourId = registration.TourId, ActorUserId = null, EntityType = RegistrationAudit.RegistrationEntityType,
            EntityId = registration.Id.ToString("D"), Action = RegistrationExpiry.AuditAction, ResultCode = "SYSTEM", OccurredAt = now,
            DataJson = JsonSerializer.Serialize(new { expiredRows })
        });
    }
}
