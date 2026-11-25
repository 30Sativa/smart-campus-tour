using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>Unlocked reads behind Tour talk (ADR-0070). The session rules match <c>FindQuestionAccessAsync</c>.</summary>
public sealed class EfTourTalkReader(ApplicationDbContext db) : ITourTalkReader
{
    public Task<TourTalkTour?> GetTourAsync(Guid tourId, CancellationToken ct) =>
        db.Tours.AsNoTracking()
            .Where(tour => tour.Id == tourId)
            .Select(tour => new TourTalkTour(tour.Id, tour.State, tour.ScheduledStartAt, tour.OperatorUserId,
                tour.OperatorUser == null ? null : tour.OperatorUser.FullName))
            .SingleOrDefaultAsync(ct);

    public Task<TourTalkViewer?> FindViewerAsync(Guid tourId, byte[] tokenHash, DateTimeOffset now, CancellationToken ct) =>
        db.BrowserSessions.AsNoTracking()
            .Where(s => s.SessionTokenHash == tokenHash && s.EndedAt == null && s.ExpiresAt > now &&
                s.Invitation.RevokedAt == null && s.Invitation.ExpiresAt > now && s.Invitation.RosterRow.IsActive &&
                s.Invitation.RosterRow.ParticipationState == "ACCEPTED" && s.Invitation.RosterRow.Registration.TourId == tourId)
            .Select(s => new TourTalkViewer(s.Invitation.RosterRow.Id, s.Invitation.RosterRow.DisplayName,
                s.Invitation.RosterRow.ClassName, s.Invitation.RosterRow.RowType,
                s.Invitation.RosterRow.Registration.Tour.State, s.Invitation.RosterRow.Registration.Tour.ScheduledStartAt))
            .SingleOrDefaultAsync(ct);
}
