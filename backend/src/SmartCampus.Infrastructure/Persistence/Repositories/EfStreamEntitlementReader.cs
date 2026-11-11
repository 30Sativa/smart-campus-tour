using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>Unlocked read for ADR-0055, asked on every token issue and every relay connection.</summary>
public sealed class EfStreamEntitlementReader(ApplicationDbContext db) : IStreamEntitlementReader
{
    private const string Scheduled = "SCHEDULED";
    private const string Ready = "READY";

    public Task<bool> StudentSessionMayWatchAsync(Guid sessionId, string robotCode, DateTimeOffset now, CancellationToken ct) =>
        db.BrowserSessions.AsNoTracking()
            .Where(s => s.Id == sessionId && s.EndedAt == null && s.ExpiresAt > now &&
                s.Invitation.RevokedAt == null && s.Invitation.ExpiresAt > now && s.Invitation.RosterRow.IsActive &&
                s.Invitation.RosterRow.ParticipationState == "ACCEPTED")
            .Select(s => s.Invitation.RosterRow.Registration.Tour)
            .AnyAsync(tour =>
                (tour.State == TourRuntime.Running &&
                    db.Robots.Any(robot => robot.Id == tour.AssignedRobotId && robot.RobotCode == robotCode)) ||
                ((tour.State == Scheduled || tour.State == Ready) &&
                    tour.TourRobotReservations.Any(hold => hold.ReleasedAt == null &&
                        db.Robots.Any(robot => robot.Id == hold.RobotId && robot.RobotCode == robotCode))), ct);
}
