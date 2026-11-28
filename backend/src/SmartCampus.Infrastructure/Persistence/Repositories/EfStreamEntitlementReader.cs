using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>Unlocked reads for ADR-0055, ADR-0063 (with ADR-0075) and ADR-0072, asked on every token issue and every relay connection.</summary>
public sealed class EfStreamEntitlementReader(ApplicationDbContext db) : IStreamEntitlementReader
{
    private const string Scheduled = "SCHEDULED";
    private const string Ready = "READY";

    public Task<bool> StudentSessionMayWatchAsync(Guid sessionId, string robotCode, DateTimeOffset now, CancellationToken ct) =>
        SessionTour(sessionId, now)
            .AnyAsync(tour =>
                (tour.State == TourRuntime.Running &&
                    db.Robots.Any(robot => robot.Id == tour.AssignedRobotId && robot.RobotCode == robotCode)) ||
                ((tour.State == Scheduled || tour.State == Ready) &&
                    tour.TourRobotReservations.Any(hold => hold.ReleasedAt == null &&
                        db.Robots.Any(robot => robot.Id == hold.RobotId && robot.RobotCode == robotCode))), ct);

    public Task<bool> StudentSessionMayWatchFallbackAsync(Guid sessionId, Guid tourId, DateTimeOffset now, CancellationToken ct) =>
        SessionTour(sessionId, now)
            .AnyAsync(tour => tour.Id == tourId && tour.State == TourRuntime.Running && tour.FallbackVideoUrl != null &&
                // ADR-0075: only while the Operator has switched the Tour to its fallback video.
                db.TourEvents.Where(e => e.TourId == tour.Id &&
                        (e.EventType == TourLifecycleEvents.VideoFallbackStarted || e.EventType == TourLifecycleEvents.VideoLiveRestored))
                    .OrderByDescending(e => e.Id).Select(e => e.EventType).FirstOrDefault() == TourLifecycleEvents.VideoFallbackStarted, ct);

    public Task<bool> StudentSessionIsInTourAsync(Guid sessionId, Guid tourId, DateTimeOffset now, CancellationToken ct) =>
        SessionTour(sessionId, now).AnyAsync(tour => tour.Id == tourId, ct);

    public Task<string?> RunningTourFallbackVideoAsync(Guid tourId, CancellationToken ct) =>
        db.Tours.AsNoTracking()
            .Where(tour => tour.Id == tourId && tour.State == TourRuntime.Running)
            .Select(tour => tour.FallbackVideoUrl)
            .FirstOrDefaultAsync(ct);

    /// <summary>The Tour of an open, unexpired session on an unrevoked, unexpired invitation of an active ACCEPTED row.</summary>
    private IQueryable<Tour> SessionTour(Guid sessionId, DateTimeOffset now) =>
        db.BrowserSessions.AsNoTracking()
            .Where(s => s.Id == sessionId && s.EndedAt == null && s.ExpiresAt > now &&
                s.Invitation.RevokedAt == null && s.Invitation.ExpiresAt > now && s.Invitation.RosterRow.IsActive &&
                s.Invitation.RosterRow.ParticipationState == "ACCEPTED")
            .Select(s => s.Invitation.RosterRow.Registration.Tour);
}
