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
    /// <summary>BR-26: 20 until NFR-CAP-01 passes, and the 40 of CK_Tours_Capacity is the ceiling either way (ADR-0048).</summary>
    public const int DefaultMaxCapacity = 20;
    /// <summary>How long a quick Tour waits to be started when Tours:ShortNoticeMinLeadMinutes is not set (ADR-0053).</summary>
    public const int DefaultShortNoticeMinLeadMinutes = 30;
    public const int CapacityCeiling = 40;
    // 15 minutes to prepare, 15 to finish and at least one minute of Tour.
    private static readonly TimeSpan MinShiftLength = TimeSpan.FromMinutes(31);

    public IReadOnlyList<TourShift> Shifts { get; }
    public int RecommendedMaxMinutes { get; }
    public int RecommendedMaxSeconds => RecommendedMaxMinutes * 60;
    public int MaxCapacity { get; }
    /// <summary>The longest Tour any shift can hold; a route needing more fits no shift.</summary>
    public int LongestShiftMaxSeconds => Shifts.Max(TourSchedule.MaxDurationSeconds);
    /// <summary>
    /// How long a quick (short-notice) Tour waits to be started: its latest Start is this long after creation (ADR-0053).
    /// Quick Tours are always available; the key keeps its ADR-0050 name, Tours:ShortNoticeMinLeadMinutes.
    /// </summary>
    public TimeSpan ShortNoticeMinLead { get; }

    public TourScheduleSettings(IEnumerable<TourShiftOption>? shifts, int? recommendedMaxMinutes, int? maxCapacity = null,
        int? shortNoticeMinLeadMinutes = null)
    {
        var minutes = shortNoticeMinLeadMinutes ?? DefaultShortNoticeMinLeadMinutes;
        if (minutes <= 0 || TimeSpan.FromMinutes(minutes) >= TourSchedule.LeadTime)
            throw new InvalidOperationException("Tours:ShortNoticeMinLeadMinutes must be greater than 0 and shorter than the standard lead time.");
        ShortNoticeMinLead = TimeSpan.FromMinutes(minutes);
        MaxCapacity = maxCapacity ?? DefaultMaxCapacity;
        if (MaxCapacity is < 1 or > CapacityCeiling) throw new InvalidOperationException("Tours:MaxCapacity must be between 1 and 40.");
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
    public const int RegistrationCloseHours = 48;
    public static readonly TimeSpan RegistrationClose = TimeSpan.FromHours(RegistrationCloseHours);
    /// <summary>BR-05: from this long before the Tour, what Staff has not decided expires and nothing new may be requested.</summary>
    public static readonly TimeSpan PendingDecisionClose = TimeSpan.FromHours(24);
    public static readonly TimeSpan ReservationBuffer = TimeSpan.FromMinutes(15);
    // Asia/Ho_Chi_Minh has no daylight saving; a fixed offset needs no time zone data in the runtime image.
    private static readonly TimeSpan CampusOffset = TimeSpan.FromHours(7);

    /// <summary>When new rows stop. A short-notice Tour has no 48-hour close: Staff closes its list with READY (ADR-0050).</summary>
    public static DateTimeOffset RegistrationClosesAt(DateTimeOffset start, bool isShortNotice) =>
        isShortNotice ? start : start - RegistrationClose;

    /// <summary>When Staff review closes (BR-05). A short-notice Tour has no 24-hour close; undecided rows block READY instead (ADR-0050).</summary>
    public static DateTimeOffset ReviewClosesAt(DateTimeOffset start, bool isShortNotice) =>
        isShortNotice ? start : start - PendingDecisionClose;


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
    /// force inside the shift, including an older Tour held at an odd time, such as a quick Tour (ADR-0053).
    /// </summary>
    public static TourSlotBlock? Evaluate(TourShiftOnDay shift, DateTimeOffset now, TourReservationPlan? plan,
        IReadOnlyCollection<TourReservationHold> holds, TourShiftBlockView? adminBlock = null)
    {
        var start = TourStart(shift.Date, shift.Shift);
        if (start - now < LeadTime)
            return new(LeadTimeTooShort, "Quá gần hiện tại, cần tạo trước ít nhất 72 giờ");
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

    /// <summary>
    /// A quick Tour's latest Start, which is also its published time (ADR-0053): creation plus the configured wait, on the
    /// next whole minute.
    /// </summary>
    public static DateTimeOffset QuickTourDeadline(DateTimeOffset now, TimeSpan wait)
    {
        var ticks = (now + wait).UtcTicks;
        return new DateTimeOffset((ticks + TimeSpan.TicksPerMinute - 1) / TimeSpan.TicksPerMinute * TimeSpan.TicksPerMinute, TimeSpan.Zero);
    }

    /// <summary>
    /// A quick Tour holds its robot from creation until a run started at the latest Start, plus the finish buffer, would
    /// end. Start may come at any moment inside it, so the hold needs no shift (ADR-0053).
    /// </summary>
    public static (DateTimeOffset StartsAt, DateTimeOffset EndsAt) QuickTourHold(DateTimeOffset now, DateTimeOffset deadline, int expectedSeconds) =>
        (now, deadline + TimeSpan.FromSeconds(expectedSeconds) + ReservationBuffer);

    /// <summary>The campus dates a hold touches, in order, so their Admin locks are taken the same way every time.</summary>
    public static IReadOnlyList<DateOnly> DatesOf(DateTimeOffset startsAt, DateTimeOffset endsAt)
    {
        var dates = new List<DateOnly>();
        for (var date = CampusDate(startsAt); date <= CampusDate(endsAt); date = date.AddDays(1)) dates.Add(date);
        return dates;
    }

    /// <summary>The first Admin block whose day, or whose shift, overlaps the hold; null when none does.</summary>
    public static TourScheduleBlock? QuickTourAdminBlock(TourScheduleSettings settings, IEnumerable<TourScheduleBlock> activeBlocks,
        DateTimeOffset startsAt, DateTimeOffset endsAt) =>
        activeBlocks.OrderBy(block => block.BlockDate).ThenBy(block => block.ShiftCode is not null).FirstOrDefault(block =>
        {
            var shift = block.ShiftCode is null ? null : settings.Shifts.FirstOrDefault(item => item.Code == block.ShiftCode);
            if (block.ShiftCode is not null && shift is null) return false;
            var (from, to) = shift is null ? DayWindow(block.BlockDate) : ShiftWindow(block.BlockDate, shift);
            return from < endsAt && to > startsAt;
        });

    /// <summary>
    /// Null when a quick Tour can be created now (ADR-0053). Order: remeasure, length (no longer than the longest shift
    /// holds), Admin block, then any hold of the robot over this Tour's own hold.
    /// </summary>
    public static TourSlotBlock? EvaluateQuickTour(TourScheduleSettings settings, DateTimeOffset now, DateTimeOffset deadline,
        TourReservationPlan? plan, IReadOnlyCollection<TourReservationHold> holds, IEnumerable<TourScheduleBlock> activeBlocks)
    {
        if (plan is null) return new(RemeasureRequired, "Cần chạy thử lại tuyến để đo theo định nghĩa mới");
        if (plan.ExpectedDurationSeconds > settings.LongestShiftMaxSeconds)
            return new(RouteTooLongForShift, $"Tuyến cần {Minutes(plan.ExpectedDurationSeconds)}, Tour dài nhất được {Minutes(settings.LongestShiftMaxSeconds)}");
        var (startsAt, endsAt) = QuickTourHold(now, deadline, plan.ExpectedDurationSeconds);
        if (QuickTourAdminBlock(settings, activeBlocks, startsAt, endsAt) is { } block)
            return new(ShiftBlocked, $"{(block.ShiftCode is null ? "Ngày" : "Ca")} trong thời gian giữ robot đã bị khoá: {block.Reason}");
        var clash = holds.Where(hold => hold.StartsAt < endsAt && hold.EndsAt > startsAt).OrderBy(hold => hold.StartsAt).FirstOrDefault();
        return clash is null ? null : new(ReservationOverlap, $"Robot đang được giữ cho Tour {clash.TourName} từ {clash.StartsAt.ToOffset(CampusOffset):HH\\:mm dd\\/MM}");
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
