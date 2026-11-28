using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

/// <summary>ADR-0075: the video switch events of one Tour; the newest one is the Tour's video mode.</summary>
internal static class TourVideoModeReads
{
    public static IQueryable<TourEvent> Switches(ApplicationDbContext db, Guid tourId) =>
        db.TourEvents.Where(e => e.TourId == tourId &&
            (e.EventType == TourLifecycleEvents.VideoFallbackStarted || e.EventType == TourLifecycleEvents.VideoLiveRestored));
}
