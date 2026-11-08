using System.Globalization;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Tours;

/// <summary>The configured start times of a Tour, local to the campus.</summary>
public sealed class TourScheduleSettings
{
    public IReadOnlyList<TimeOnly> StartSlots { get; }
    public TimeOnly CustomStartEarliest { get; }
    public TimeOnly CustomStartLatest { get; }
    /// <summary>Minimum time between saving a Tour and its start (ADR-0035; configured by ADR-0047).</summary>
    public TimeSpan LeadTime { get; }
    /// <summary>New registrations and rows close this long before the start (SRS 48 h by default; ADR-0047).</summary>
    public TimeSpan RegistrationClose { get; }

    public TourScheduleSettings(IEnumerable<string>? startSlots, string? customStartEarliest, string? customStartLatest,
        int leadTimeHours = 72, int registrationCloseHours = 48)
    {
        var slots = new SortedSet<TimeOnly>();
        foreach (var value in startSlots ?? []) slots.Add(Parse("StartSlots", value));
        if (slots.Count == 0) throw new InvalidOperationException("Tours:StartSlots must list at least one start time.");
        StartSlots = [.. slots];
        CustomStartEarliest = Parse("CustomStartEarliest", customStartEarliest);
        CustomStartLatest = Parse("CustomStartLatest", customStartLatest);
        if (CustomStartEarliest >= CustomStartLatest) throw new InvalidOperationException("Tours:CustomStartEarliest must be before Tours:CustomStartLatest.");
        if (registrationCloseHours < 0) throw new InvalidOperationException("Tours:RegistrationCloseHours must not be negative.");
        // A Tour created at the minimum lead time must still accept registrations.
        if (leadTimeHours <= registrationCloseHours)
            throw new InvalidOperationException("Tours:LeadTimeHours must be greater than Tours:RegistrationCloseHours.");
        LeadTime = TimeSpan.FromHours(leadTimeHours);
        RegistrationClose = TimeSpan.FromHours(registrationCloseHours);
    }

    private static TimeOnly Parse(string key, string? value) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time) ? time
            : throw new InvalidOperationException($"Tours:{key} has an invalid time '{value}'; use HH:mm.");
}

public sealed record TourReservationPlan(int MeasuredDurationSeconds, int ExpectedDurationSeconds);
public sealed record TourReservationHold(string TourName, DateTimeOffset StartsAt, DateTimeOffset EndsAt);
public sealed record TourSlotBlock(string Code, string Message);

/// <summary>
/// One calculation behind creating a Tour and listing its slots (ADR-0035), so the two cannot disagree.
/// </summary>
public static class TourSchedule
{
    public const string OutsideStartHours = "OUTSIDE_START_HOURS";
    public const string LeadTimeTooShort = "LEAD_TIME_TOO_SHORT";
    public const string ReservationOverlap = "RESERVATION_OVERLAP";
    public const string RouteTooLongForGap = "ROUTE_TOO_LONG_FOR_GAP";
    public const string RemeasureRequired = "ROUTE_TEST_REMEASURE_REQUIRED";

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

    /// <summary>Null for a configured slot or a whole minute inside the custom hours (ADR-0036).</summary>
    public static TourSlotBlock? StartRule(TourScheduleSettings settings, DateTimeOffset start)
    {
        if (IsConfiguredSlot(settings, start)) return null;
        var time = TimeOnly.FromDateTime(start.ToOffset(CampusOffset).DateTime);
        return time.Ticks % TimeSpan.TicksPerMinute == 0 && time >= settings.CustomStartEarliest && time <= settings.CustomStartLatest ? null
            : new(OutsideStartHours, $"Ngoài giờ cho phép, chọn từ {settings.CustomStartEarliest:HH\\:mm} đến {settings.CustomStartLatest:HH\\:mm}");
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
    public static TourSlotBlock? Evaluate(DateTimeOffset start, DateTimeOffset now, TimeSpan leadTime, TourReservationPlan? plan,
        IReadOnlyCollection<TourReservationHold> holds)
    {
        if (start - now < leadTime)
            return new(LeadTimeTooShort, $"Quá gần hiện tại, cần tạo trước ít nhất {leadTime.TotalHours:0} giờ");
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
