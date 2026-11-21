using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfTourVoteRepository(ApplicationDbContext db) : ITourVoteRepository
{
    public async Task<TourVotingRoute?> FindVotingRouteAsync(Guid tourId, CancellationToken ct)
    {
        var tour = await db.Tours.AsNoTracking().SingleOrDefaultAsync(t => t.Id == tourId, ct);
        if (tour?.RouteRevisionId is not { } revisionId) return null;
        var revision = await db.RouteRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.Id == revisionId && r.ViewerChoosesNextStop, ct);
        if (revision is null) return null;
        var stops = await db.RouteRevisionStops.AsNoTracking().Where(s => s.RouteRevisionId == revisionId)
            .OrderBy(s => s.StopOrder).ToListAsync(ct);
        return new(tour, revision, stops);
    }

    public async Task<TourVotingRecords> LoadAsync(Guid tourId, Guid? stopVisitId, CancellationToken ct)
    {
        var visits = await db.TourStopVisits.Where(v => v.TourId == tourId).ToListAsync(ct);
        var locks = await db.TourStopLocks.Where(l => l.TourId == tourId && l.UnlockedAt == null).ToListAsync(ct);
        if (stopVisitId is not { } visitId) return new(visits, locks, [], new HashSet<Guid>());
        var votes = await db.TourStopVotes.Where(v => v.StopVisitId == visitId).ToListAsync(ct);
        // Votes of a revoked or withdrawn row stay stored but are not counted (ADR-0065 rule 5).
        var counted = await db.TourStopVotes.AsNoTracking()
            .Where(v => v.StopVisitId == visitId && v.RosterRow.IsActive && v.RosterRow.ParticipationState == "ACCEPTED" &&
                v.RosterRow.Invitation != null && v.RosterRow.Invitation.RevokedAt == null)
            .Select(v => v.RosterRowId).ToListAsync(ct);
        return new(visits, locks, votes, counted.ToHashSet());
    }

    public Task<Guid?> FindVoterRowAsync(Guid tourId, byte[] tokenHash, DateTimeOffset now, CancellationToken ct) =>
        db.BrowserSessions.AsNoTracking()
            .Where(s => s.SessionTokenHash == tokenHash && s.EndedAt == null && s.ExpiresAt > now &&
                s.Invitation.RevokedAt == null && s.Invitation.ExpiresAt > now && s.Invitation.RosterRow.IsActive &&
                s.Invitation.RosterRow.ParticipationState == "ACCEPTED" && s.Invitation.RosterRow.Registration.TourId == tourId)
            .Select(s => (Guid?)s.Invitation.RosterRowId)
            .SingleOrDefaultAsync(ct);

    public void Add(TourStopVisit visit) => db.TourStopVisits.Add(visit);
    public void Add(TourStopVote vote) => db.TourStopVotes.Add(vote);
    public void Add(TourStopLock stopLock) => db.TourStopLocks.Add(stopLock);
}
