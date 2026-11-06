using System.Globalization;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>One configured shift as read from `Tours:Shifts`; times are HH:mm, local to the campus.</summary>
public sealed class TourShiftOption
{
    public string? Code { get; set; }
    public string? Name { get; set; }
    public string? Start { get; set; }
    public string? End { get; set; }
}

/// <summary>A shift is the robot hold; the Tour starts 15 minutes after it opens (docs/lich-tour-theo-ca.md §3).</summary>
public sealed record TourShift(string Code, string Name, TimeOnly Start, TimeOnly End);

/// <summary>The fixed shifts and the recommended Tour length (docs/lich-tour-theo-ca.md §3, §4, §7).</summary>
public sealed class TourScheduleSettings
{
    public const int DefaultRecommendedMaxMinutes = 60;
    // 15 minutes to prepare, 15 to finish and at least one minute of Tour.
    private static readonly TimeSpan MinShiftLength = TimeSpan.FromMinutes(31);

    public IReadOnlyList<TourShift> Shifts { get; }
    public int RecommendedMaxMinutes { get; }
    public int RecommendedMaxSeconds => RecommendedMaxMinutes * 60;
    /// <summary>The longest Tour any shift can hold; a route needing more fits no shift.</summary>
    public int LongestShiftMaxSeconds => Shifts.Max(TourSchedule.MaxDurationSeconds);

    public TourScheduleSettings(IEnumerable<TourShiftOption>? shifts, int? recommendedMaxMinutes)
    {
        var parsed = (shifts ?? []).Select(Parse).OrderBy(shift => shift.Start).ToArray();
        if (parsed.Length == 0) throw new InvalidOperationException("Tours:Shifts must list at least one shift.");
        if (parsed.Select(shift => shift.Code).Distinct(StringComparer.Ordinal).Count() != parsed.Length)
            throw new InvalidOperationException("Tours:Shifts has a duplicated Code.");
        foreach (var shift in parsed)
        {
            if (shift.Start >= shift.End) throw new InvalidOperationException($"Tours:Shifts {shift.Code} must start before it ends.");
            if (shift.End - shift.Start < MinShiftLength) throw new InvalidOperationException($"Tours:Shifts {shift.Code} must last at least 31 minutes.");
        }
        for (var index = 1; index < parsed.Length; index++)
            if (parsed[index].Start < parsed[index - 1].End)
                throw new InvalidOperationException($"Tours:Shifts {parsed[index - 1].Code} and {parsed[index].Code} overlap.");
        Shifts = parsed;
        RecommendedMaxMinutes = recommendedMaxMinutes ?? DefaultRecommendedMaxMinutes;
        if (RecommendedMaxMinutes <= 0) throw new InvalidOperationException("Tours:RecommendedMaxMinutes must be greater than 0.");
    }

    private static TourShift Parse(TourShiftOption option)
    {
        if (string.IsNullOrWhiteSpace(option.Code)) throw new InvalidOperationException("Tours:Shifts needs a Code for every shift.");
        if (string.IsNullOrWhiteSpace(option.Name)) throw new InvalidOperationException($"Tours:Shifts {option.Code} needs a Name.");
        return new(option.Code.Trim(), option.Name.Trim(), Time(option.Code, "Start", option.Start), Time(option.Code, "End", option.End));
    }

    private static TimeOnly Time(string code, string key, string? value) =>
        TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time) ? time
            : throw new InvalidOperationException($"Tours:Shifts {code} has an invalid {key} '{value}'; use HH:mm.");
}

public sealed record TourReservationPlan(int MeasuredDurationSeconds, int ExpectedDurationSeconds);
public sealed record TourReservationHold(string TourName, DateTimeOffset StartsAt, DateTimeOffset EndsAt);
public sealed record TourSlotBlock(string Code, string Message);
/// <summary>A shift on one campus day.</summary>
public sealed record TourShiftOnDay(DateOnly Date, TourShift Shift);

/// <summary>
/// One calculation behind creating a Tour and listing its shifts, so the two cannot disagree
/// (ADR-0035, docs/lich-tour-theo-ca.md §3-§4).
/// </summary>
public static class TourSchedule
{
    public const string LeadTimeTooShort = "LEAD_TIME_TOO_SHORT";
    public const string ReservationOverlap = "RESERVATION_OVERLAP";
    public const string RouteTooLongForShift = "ROUTE_TOO_LONG_FOR_SHIFT";
    public const string ShiftBlocked = "SHIFT_BLOCKED";
    public const string RemeasureRequired = "ROUTE_TEST_REMEASURE_REQUIRED";

    public static readonly TimeSpan LeadTime = TimeSpan.FromHours(72);
    public static readonly TimeSpan RegistrationClose = TimeSpan.FromHours(48);
    public static readonly TimeSpan ReservationBuffer = TimeSpan.FromMinutes(15);
    // Asia/Ho_Chi_Minh has no daylight saving; a fixed offset needs no time zone data in the runtime image.
    private static readonly TimeSpan CampusOffset = TimeSpan.FromHours(7);

    public static DateTimeOffset SlotStart(DateOnly date, TimeOnly slot) =>
        new DateTimeOffset(date.ToDateTime(slot), CampusOffset).ToUniversalTime();

    public static DateOnly CampusDate(DateTimeOffset instant) => DateOnly.FromDateTime(instant.ToOffset(CampusOffset).DateTime);

    /// <summary>The only start a Tour may have in this shift: the shift opening plus the preparation buffer.</summary>
    public static DateTimeOffset TourStart(DateOnly date, TourShift shift) => SlotStart(date, shift.Start) + ReservationBuffer;

    /// <summary>A Tour holds its robot for the whole shift.</summary>
    public static (DateTimeOffset StartsAt, DateTimeOffset EndsAt) ShiftWindow(DateOnly date, TourShift shift) =>
        (SlotStart(date, shift.Start), SlotStart(date, shift.End));

    /// <summary>Shift length less preparation and finish; computed, never configured, so the two cannot drift apart.</summary>
    public static int MaxDurationSeconds(TourShift shift) =>
        (int)(shift.End - shift.Start - 2 * ReservationBuffer).TotalSeconds;

    /// <summary>The shift whose Tour start is exactly <paramref name="start"/>, or null.</summary>
    public static TourShiftOnDay? FindShift(TourScheduleSettings settings, DateTimeOffset start)
    {
        var date = CampusDate(start);
        return settings.Shifts.Where(shift => TourStart(date, shift) == start).Select(shift => new TourShiftOnDay(date, shift)).FirstOrDefault();
    }

    public static TourShiftOnDay RequireShift(TourScheduleSettings settings, DateTimeOffset start) =>
        FindShift(settings, start) ?? throw new ConflictException(
            $"Giờ bắt đầu không khớp ca nào. Chọn một ca: {string.Join(", ", settings.Shifts.Select(shift => $"{shift.Name} bắt đầu {(shift.Start.Add(ReservationBuffer)):HH\\:mm}"))}.",
            "TOUR_SLOT_NOT_ALLOWED");

    /// <summary>Added dwell lengthens the measured run; shortened dwell never shortens it.</summary>
    public static int ExpectedDurationSeconds(int measuredSeconds,
        IEnumerable<(int StopOrder, int DwellSeconds)> testedStops, IEnumerable<(int StopOrder, int DwellSeconds)> targetStops)
    {
        var tested = testedStops.ToDictionary(stop => stop.StopOrder, stop => stop.DwellSeconds);
        return measuredSeconds + targetStops.Sum(stop => Math.Max(0, stop.DwellSeconds - tested.GetValueOrDefault(stop.StopOrder)));
    }

    /// <summary>The Admin block closing this shift, if any; a whole-day block wins over one for the shift (docs/lich-tour-theo-ca.md §5).</summary>
    public static TourShiftBlockView? BlockOf(IEnumerable<TourScheduleBlock> activeBlocks, TourShiftOnDay shift)
    {
        var ofDay = activeBlocks.Where(block => block.BlockDate == shift.Date).ToArray();
        var block = ofDay.FirstOrDefault(item => item.ShiftCode is null) ?? ofDay.FirstOrDefault(item => item.ShiftCode == shift.Shift.Code);
        return block is null ? null : new(block.Id, block.ShiftCode is null ? ScheduleBlockScope.Day : ScheduleBlockScope.Shift, block.Reason);
    }

    /// <summary>The whole campus date, for closing or looking across a day.</summary>
    public static (DateTimeOffset StartsAt, DateTimeOffset EndsAt) DayWindow(DateOnly date) =>
        (SlotStart(date, TimeOnly.MinValue), SlotStart(date.AddDays(1), TimeOnly.MinValue));

    /// <summary>
    /// Null when the shift can be used. Order: lead time, remeasure, length, Admin block, then any hold still in
    /// force inside the shift, including an older Tour held at an odd time.
    /// </summary>
    public static TourSlotBlock? Evaluate(TourShiftOnDay shift, DateTimeOffset now, TourReservationPlan? plan,
        IReadOnlyCollection<TourReservationHold> holds, TourShiftBlockView? adminBlock = null)
    {
        var start = TourStart(shift.Date, shift.Shift);
        if (start - now < LeadTime) return new(LeadTimeTooShort, "Quá gần hiện tại, cần tạo trước ít nhất 72 giờ");
        if (plan is null) return new(RemeasureRequired, "Cần chạy thử lại tuyến để đo theo định nghĩa mới");
        var max = MaxDurationSeconds(shift.Shift);
        if (plan.ExpectedDurationSeconds > max)
            return new(RouteTooLongForShift, $"Tuyến cần {Minutes(plan.ExpectedDurationSeconds)}, ca này chỉ chứa được {Minutes(max)}");
        if (adminBlock is not null)
            return new(ShiftBlocked, $"{(adminBlock.Scope == ScheduleBlockScope.Day ? "Ngày này" : "Ca này")} đã bị khoá: {adminBlock.Reason}");
        var (startsAt, endsAt) = ShiftWindow(shift.Date, shift.Shift);
        var clash = holds.Where(hold => hold.StartsAt < endsAt && hold.EndsAt > startsAt).OrderBy(hold => hold.StartsAt).FirstOrDefault();
        return clash is null ? null : new(ReservationOverlap, $"Trùng khung giữ robot của Tour {clash.TourName}");
    }

    public static void EnsureUsable(TourSlotBlock? block)
    {
        if (block is null) return;
        throw new ConflictException(block.Message, block.Code switch
        {
            LeadTimeTooShort => "TOUR_LEAD_TIME_TOO_SHORT",
            RemeasureRequired => RemeasureRequired,
            RouteTooLongForShift => RouteTooLongForShift,
            ShiftBlocked => ShiftBlocked,
            _ => "ROBOT_RESERVATION_CONFLICT"
        });
    }

    /// <summary>How a route's expected length sits against the shifts (docs/lich-tour-theo-ca.md §4).</summary>
    public static string ScheduleFit(TourScheduleSettings settings, int? expectedSeconds) =>
        expectedSeconds is not { } seconds ? RouteScheduleFit.Unknown
        : seconds > settings.LongestShiftMaxSeconds ? RouteScheduleFit.TooLongForShift
        : seconds > settings.RecommendedMaxSeconds ? RouteScheduleFit.OverRecommended
        : RouteScheduleFit.Fits;

    private static string Minutes(int seconds) => seconds % 60 == 0 ? $"{seconds / 60} phút" : $"{seconds / 60} phút {seconds % 60} giây";
}

public static class RouteScheduleFit
{
    public const string Unknown = "UNKNOWN";
    public const string Fits = "FITS";
    public const string OverRecommended = "OVER_RECOMMENDED";
    public const string TooLongForShift = "TOO_LONG_FOR_SHIFT";
}
