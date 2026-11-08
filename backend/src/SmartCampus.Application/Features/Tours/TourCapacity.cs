using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>Seats of a Tour (BR-26, ADR-0048). The caller holds the Tour root lock, so the count cannot move under it.</summary>
internal static class TourCapacity
{
    public const string ExceededCode = "TOUR_CAPACITY_EXCEEDED";

    /// <summary>
    /// Refuses a write that adds seats past the capacity. A write that adds none always passes, so a Tour already above
    /// its capacity from before v1.18 stays editable.
    /// </summary>
    public static void EnsureRoom(Tour tour, int heldByOthers, int heldBefore, int heldAfter)
    {
        if (heldAfter <= heldBefore || heldByOthers + heldAfter <= tour.Capacity) return;
        var remaining = Math.Max(0, tour.Capacity - heldByOthers - heldBefore);
        throw new ConflictException($"Tour này chỉ còn {remaining} chỗ trên tổng {tour.Capacity} chỗ.", ExceededCode,
            new Dictionary<string, string[]> { ["remainingSeats"] = [remaining.ToString(System.Globalization.CultureInfo.InvariantCulture)] });
    }
}
