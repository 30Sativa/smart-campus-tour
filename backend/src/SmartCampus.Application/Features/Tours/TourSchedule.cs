using System.Globalization;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Tours;

/// <summary>The configured start times of a Tour, local to the campus.</summary>
public sealed class TourScheduleSettings
{
    public IReadOnlyList<TimeOnly> StartSlots { get; }

    public TourScheduleSettings(IEnumerable<string>? startSlots)
    {
        var slots = new SortedSet<TimeOnly>();
        foreach (var value in startSlots ?? [])
        {
            if (!TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var slot))
                throw new InvalidOperationException($"Tours:StartSlots has an invalid time '{value}'; use HH:mm.");
            slots.Add(slot);
        }
        if (slots.Count == 0) throw new InvalidOperationException("Tours:StartSlots must list at least one start time.");
        StartSlots = [.. slots];
    }
}

public sealed record TourReservationPlan(int MeasuredDurationSeconds, int ExpectedDurationSeconds);
public sealed record TourReservationHold(string TourName, DateTimeOffset StartsAt, DateTimeOffset EndsAt);
public sealed record TourSlotBlock(string Code, string Message);

/// <summary>
/// One calculation behind creating a Tour and listing its slots (ADR-0035), so the two cannot disagree.
/// </summary>
public static class TourSchedule
{
    public const string LeadTimeTooShort = "LEAD_TIME_TOO_SHORT";
    public const string ReservationOverlap = "RESERVATION_OVERLAP";
    public const string RouteTooLongForGap = "ROUTE_TOO_LONG_FOR_GAP";
    public const string RemeasureRequired = "ROUTE_TEST_REMEASURE_REQUIRED";

    public static readonly TimeSpan LeadTime = TimeSpan.FromHours(72);
    public static readonly TimeSpan RegistrationClose = TimeSpan.FromHours(48);
    public static readonly TimeSpan ReservationBuffer = TimeSpan.FromMinutes(15);
    // Asia/Ho_Chi_Minh has no daylight saving; a fixed offset needs no time zone data in the runtime image.
    private static readonly TimeSpan CampusOffset = TimeSpan.FromHours(7);

    public static DateTimeOffset SlotStart(DateOnly date, TimeOnly slot) =>
        new DateTimeOffset(date.ToDateTime(slot), CampusOffset).ToUniversalTime();

    public static bool IsConfiguredSlot(TourScheduleSettings settings, DateTimeOffset start)
    {
        var local = start.ToOffset(CampusOffset);
        return settings.StartSlots.Any(slot => SlotStart(DateOnly.FromDateTime(local.DateTime), slot) == start);
    }

    /// <summary>Added dwell lengthens the measured run; shortened dwell never shortens it.</summary>
    public static int ExpectedDurationSeconds(int measuredSeconds,
        IEnumerable<(int StopOrder, int DwellSeconds)> testedStops, IEnumerable<(int StopOrder, int DwellSeconds)> targetStops)
    {
        var tested = testedStops.ToDictionary(stop => stop.StopOrder, stop => stop.DwellSeconds);
        return measuredSeconds + targetStops.Sum(stop => Math.Max(0, stop.DwellSeconds - tested.GetValueOrDefault(stop.StopOrder)));
    }

    public static (DateTimeOffset StartsAt, DateTimeOffset EndsAt) Window(DateTimeOffset start, int expectedSeconds) =>
        (start - ReservationBuffer, start + TimeSpan.FromSeconds(expectedSeconds) + ReservationBuffer);

    /// <summary>Null when the start can be used. A hold covering the opening of the window is a clash; one that begins inside it leaves too small a gap.</summary>
    public static TourSlotBlock? Evaluate(DateTimeOffset start, DateTimeOffset now, TourReservationPlan? plan,
        IReadOnlyCollection<TourReservationHold> holds)
    {
        if (start - now < LeadTime) return new(LeadTimeTooShort, "Quá gần hiện tại, cần tạo trước ít nhất 72 giờ");
        if (plan is null) return new(RemeasureRequired, "Cần chạy thử lại tuyến để đo theo định nghĩa mới");
        var (startsAt, endsAt) = Window(start, plan.ExpectedDurationSeconds);
        var clash = holds.Where(hold => hold.StartsAt <= startsAt && hold.EndsAt > startsAt).OrderBy(hold => hold.StartsAt).FirstOrDefault();
        if (clash is not null) return new(ReservationOverlap, $"Trùng khung giữ robot của Tour {clash.TourName}");
        return holds.Any(hold => hold.StartsAt < endsAt && hold.EndsAt > startsAt)
            ? new(RouteTooLongForGap, "Tuyến dài hơn khoảng trống còn lại") : null;
    }

    public static void EnsureUsable(TourSlotBlock? block)
    {
        if (block is null) return;
        throw new ConflictException(block.Message, block.Code switch
        {
            LeadTimeTooShort => "TOUR_LEAD_TIME_TOO_SHORT",
            RemeasureRequired => RemeasureRequired,
            _ => "ROBOT_RESERVATION_CONFLICT"
        });
    }
}
