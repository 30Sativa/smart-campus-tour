using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateScheduleBlock;
using SmartCampus.Application.Features.Tours.Queries.GetTourShifts;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>The three shifts of docs/lich-tour-theo-ca.md §7, shared by tests that need TourScheduleSettings.</summary>
internal static class TourShiftsFixture
{
    public static TourShiftOption Shift(string code, string name, string start, string end) => new() { Code = code, Name = name, Start = start, End = end };

    public static readonly TourShiftOption[] Options =
    [
        Shift("S2", "Ca chiều 1", "13:00", "15:00"),
        Shift("S1", "Ca sáng", "08:00", "10:00"),
        Shift("S3", "Ca chiều 2", "16:00", "18:00"),
    ];

    public static readonly TourScheduleSettings Settings = new(Options, 60);
}

public sealed class CreateScheduleBlockValidatorTests
{
    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    // 18:00 UTC on 30/11 is already 01:00 on 01/12 in Vietnam.
    private static readonly CreateScheduleBlockCommandValidator Validator =
        new(TourShiftsFixture.Settings, new Clock(new DateTimeOffset(2026, 11, 30, 18, 0, 0, TimeSpan.Zero)));

    private static FluentValidation.Results.ValidationResult Validate(int year, int month, int day) =>
        Validator.Validate(new CreateScheduleBlockCommand(Guid.NewGuid(), new(Guid.NewGuid(), new DateOnly(year, month, day), "S1", "Bảo trì")));

    [Fact]
    public void Yesterday_InVietnam_IsRefused()
    {
        var result = Validate(2026, 11, 30);
        Assert.Contains(result.Errors, error => error.ErrorMessage == "Không khoá được ngày đã qua.");
    }

    [Theory]
    [InlineData(2026, 12, 1)]
    [InlineData(2026, 12, 2)]
    public void TodayInVietnamAndLater_AreAccepted(int year, int month, int day) =>
        Assert.True(Validate(year, month, day).IsValid);
}

public sealed class TourScheduleTests
{
    private static readonly TourScheduleSettings Settings = TourShiftsFixture.Settings;
    private static readonly TourReservationPlan Plan = new(1200, 1200);
    private static readonly DateOnly Day = new(2026, 12, 1);
    private static readonly TourShift Morning = Settings.Shifts[0];
    private static readonly TourShiftOnDay MorningOnDay = new(Day, Morning);
    private static readonly DateTimeOffset Start = TourSchedule.TourStart(Day, Morning);
    private static readonly DateTimeOffset LongAgo = Start.AddDays(-30);

    [Fact]
    public void Settings_SortShiftsByStart_AndKeepTheRecommendedLength()
    {
        Assert.Equal(["S1", "S2", "S3"], Settings.Shifts.Select(shift => shift.Code));
        Assert.Equal(3600, Settings.RecommendedMaxSeconds);
        Assert.Equal(5400, Settings.LongestShiftMaxSeconds);
        Assert.Equal(TourScheduleSettings.DefaultRecommendedMaxMinutes, new TourScheduleSettings(TourShiftsFixture.Options, null).RecommendedMaxMinutes);
    }

    public static TheoryData<TourShiftOption[], int?> InvalidSettings => new()
    {
        { [], 60 },
        { [TourShiftsFixture.Shift("S1", "A", "08:00", "10:00"), TourShiftsFixture.Shift("S1", "B", "13:00", "15:00")], 60 },
        { [TourShiftsFixture.Shift("S1", "A", "10:00", "10:00")], 60 },
        { [TourShiftsFixture.Shift("S1", "A", "10:00", "08:00")], 60 },
        { [TourShiftsFixture.Shift("S1", "A", "08:00", "10:00"), TourShiftsFixture.Shift("S2", "B", "09:59", "12:00")], 60 },
        { [TourShiftsFixture.Shift("S1", "A", "08:00", "08:30")], 60 },
        { [TourShiftsFixture.Shift("S1", "A", "8am", "10:00")], 60 },
        { [TourShiftsFixture.Shift("", "A", "08:00", "10:00")], 60 },
        { [TourShiftsFixture.Shift("S1", "A", "08:00", "10:00")], 0 },
        { [TourShiftsFixture.Shift("S1", "A", "08:00", "10:00")], -5 },
    };

    [Theory]
    [MemberData(nameof(InvalidSettings))]
    public void Settings_RefuseToStart_WithNoShifts_DuplicatesBadTimesOverlapsShortShiftsOrNoRecommendation(TourShiftOption[] shifts, int? recommended) =>
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings(shifts, recommended));

    [Fact]
    public void Settings_RefuseAMissingShiftList() =>
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings(null, 60));

    [Fact]
    public void AThirtyOneMinuteShift_IsTheShortestAllowed() =>
        Assert.Equal(60, TourSchedule.MaxDurationSeconds(new TourScheduleSettings([TourShiftsFixture.Shift("S1", "A", "08:00", "08:31")], 60).Shifts[0]));

    [Fact]
    public void TheTourStartsFifteenMinutesAfterTheShiftOpens_AndHoldsTheWholeShift()
    {
        Assert.Equal(new DateTimeOffset(2026, 12, 1, 8, 15, 0, TimeSpan.FromHours(7)), Start);
        var (startsAt, endsAt) = TourSchedule.ShiftWindow(Day, Morning);
        Assert.Equal(new DateTimeOffset(2026, 12, 1, 8, 0, 0, TimeSpan.FromHours(7)), startsAt);
        Assert.Equal(new DateTimeOffset(2026, 12, 1, 10, 0, 0, TimeSpan.FromHours(7)), endsAt);
    }

    [Fact]
    public void ATwoHourShiftHoldsANinetyMinuteTour() =>
        Assert.Equal(5400, TourSchedule.MaxDurationSeconds(Morning));

    [Fact]
    public void FindShift_AcceptsOnlyTheShiftsTourStart()
    {
        Assert.Equal(("S2", Day), TourSchedule.FindShift(Settings, TourSchedule.SlotStart(Day, new TimeOnly(13, 15))) is { } found ? (found.Shift.Code, found.Date) : default);
        Assert.Equal("S1", TourSchedule.FindShift(Settings, new DateTimeOffset(2026, 12, 1, 1, 15, 0, TimeSpan.Zero))?.Shift.Code);
        Assert.Null(TourSchedule.FindShift(Settings, Start.AddMinutes(1)));
        Assert.Null(TourSchedule.FindShift(Settings, Start.AddMinutes(-1)));
        Assert.Null(TourSchedule.FindShift(Settings, TourSchedule.SlotStart(Day, new TimeOnly(8, 0))));
        Assert.Null(TourSchedule.FindShift(Settings, TourSchedule.SlotStart(Day, new TimeOnly(9, 0))));
    }

    [Fact]
    public void RequireShift_RefusesAnyOtherTime_AsTourSlotNotAllowed()
    {
        var error = Assert.Throws<ConflictException>(() => TourSchedule.RequireShift(Settings, Start.AddMinutes(1)));
        Assert.Equal("TOUR_SLOT_NOT_ALLOWED", error.Code);
        Assert.Contains("Ca sáng bắt đầu 08:15", error.Message);
    }

    // Start (0,0) -> stop 1 (3,4) -> stop 2 (3,10): 5 m + 6 m = 11 m of travel and 30 + 45 s of dwell.
    private static RouteRevision Revision(string endMode, decimal? endX = null, decimal? endY = null) =>
        new() { StartX = 0m, StartY = 0m, EndMode = endMode, EndX = endX, EndY = endY, EndYaw = endX is null ? null : 0m };

    private static readonly RouteRevisionStop[] TwoStops =
    [
        // Given out of order: the estimate follows StopOrder.
        new() { StopOrder = 2, X = 3m, Y = 10m, DwellSeconds = 45 },
        new() { StopOrder = 1, X = 3m, Y = 4m, DwellSeconds = 30 },
    ];

    [Fact]
    public void Estimate_EndingAtTheLastStop_HasNoFinalLeg() =>
        // 11 m at 0.25 m/s = 44 s.
        Assert.Equal(75 + 44, TourSchedule.EstimatedDurationSeconds(Revision("LAST_POI"), TwoStops, 0.25));

    [Fact]
    public void Estimate_ReturningToTheStart_AddsTheLegBack() =>
        // Back from (3,10) to (0,0) is sqrt(109) = 10.44 m, so 21.44 m = 85.76 s, rounded up to 86.
        Assert.Equal(75 + 86, TourSchedule.EstimatedDurationSeconds(Revision("POSE", 0m, 0m), TwoStops, 0.25));

    [Fact]
    public void Estimate_EndingAtAPose_AddsTheLegToIt() =>
        // (3,10) -> (3,14) is 4 m: 15 m = 60 s.
        Assert.Equal(75 + 60, TourSchedule.EstimatedDurationSeconds(Revision("POSE", 3m, 14m), TwoStops, 0.25));

    [Fact]
    public void Estimate_FollowsTheConfiguredSpeed() =>
        Assert.Equal(75 + 11, TourSchedule.EstimatedDurationSeconds(Revision("LAST_POI"), TwoStops, 1.0));

    [Theory]
    [InlineData(0.0)]
    [InlineData(-0.25)]
    public void Settings_RefuseASpeedThatIsNotPositive(double speed) =>
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings(TourShiftsFixture.Options, 60, estimatedSpeedMetersPerSecond: speed));

    [Fact]
    public void Settings_DefaultTheSpeedTo025() =>
        Assert.Equal(0.25, new TourScheduleSettings(TourShiftsFixture.Options, 60).EstimatedSpeedMetersPerSecond);

    [Fact]
    public void ALunchShiftRefusesARouteEstimatedOver30Minutes()
    {
        var lunch = new TourShiftOnDay(Day, new TourShift("S4", "Ca trưa", new TimeOnly(11, 0), new TimeOnly(12, 0)));
        // 30 stops of 60 s plus 1 m of travel: 1804 s, more than the 30 minutes a one-hour shift holds.
        var stops = Enumerable.Range(1, 30).Select(order => new RouteRevisionStop { StopOrder = order, X = 0m, Y = order / 30m, DwellSeconds = 60 }).ToArray();
        var estimate = TourSchedule.EstimatedDurationSeconds(Revision("LAST_POI"), stops, 0.25);
        Assert.Equal(1804, estimate);
        var block = TourSchedule.Evaluate(lunch, LongAgo, new(estimate, estimate), []);
        Assert.Equal(TourSchedule.RouteTooLongForShift, block!.Code);
        Assert.Equal("Tuyến cần 31 phút, ca này chỉ chứa được 30 phút", block.Message);
    }

    [Fact]
    public void LeadTime_AcceptsExactly72Hours_AndRefuses71Hours59Minutes()
    {
        Assert.Null(TourSchedule.Evaluate(MorningOnDay, Start.AddHours(-72), Plan, []));
        var block = TourSchedule.Evaluate(MorningOnDay, Start.AddHours(-72).AddMinutes(1), Plan, []);
        Assert.Equal(TourSchedule.LeadTimeTooShort, block!.Code);
        Assert.Equal("Quá gần hiện tại, cần tạo trước ít nhất 72 giờ", block.Message);
    }

    [Fact]
    public void QuickTourDeadline_IsTheWaitFromNow_OnTheNextWholeMinute()
    {
        var wait = TimeSpan.FromMinutes(60);
        Assert.Equal(Start.AddMinutes(60), TourSchedule.QuickTourDeadline(Start, wait));
        Assert.Equal(Start.AddMinutes(61), TourSchedule.QuickTourDeadline(Start.AddSeconds(1), wait));
    }

    [Fact]
    public void QuickTourHold_RunsFromNow_UntilARunStartedAtTheDeadlineHasFinished()
    {
        var deadline = Start.AddMinutes(60);
        Assert.Equal((Start, deadline.AddSeconds(1200).AddMinutes(15)), TourSchedule.QuickTourHold(Start, deadline, 1200));
    }

    [Fact]
    public void QuickTourHold_OfAnEstimatedRoute_EndsAtTheDeadlinePlusTheEstimatePlus15Minutes()
    {
        var deadline = Start.AddMinutes(30);
        var estimate = TourSchedule.EstimatedDurationSeconds(Revision("POSE", 0m, 0m), TwoStops, 0.25);
        Assert.Equal(161, estimate);
        // 161 s is shown as 3 minutes, so the run is expected to end 3 minutes after the deadline.
        Assert.Equal(deadline.AddMinutes(3).AddMinutes(15), TourSchedule.QuickTourHold(Start, deadline, estimate).EndsAt);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 60)]
    [InlineData(59, 60)]
    [InlineData(60, 60)]
    [InlineData(61, 120)]
    [InlineData(2349, 2400)] // 39 min 9 s reads 40 minutes
    [InlineData(1804, 1860)]
    public void TheExpectedLength_RoundsUpToAWholeMinute(int seconds, int rounded) =>
        Assert.Equal(rounded, TourSchedule.RoundedDurationSeconds(seconds));

    [Fact]
    public void TheExpectedEnd_IsTheStartPlusTheRoundedLength()
    {
        var start = new DateTimeOffset(2026, 11, 16, 4, 15, 0, TimeSpan.Zero); // 11:15 campus time
        Assert.Equal(start.AddMinutes(4), TourSchedule.ExpectedEnd(start, 189)); // 3 min 9 s -> 4 minutes, ends 11:19
        Assert.Equal(start.AddMinutes(40), TourSchedule.ExpectedEnd(start, 2349));
        Assert.Equal(start.AddMinutes(3), TourSchedule.ExpectedEnd(start, 180));
    }

    [Fact]
    public void AnEveryShiftRefusal_NamesTheRoundedLength()
    {
        var settings = new TourScheduleSettings(TourShiftsFixture.Options, 60);
        var block = TourSchedule.EvaluateQuickTour(settings, Start, Start.AddMinutes(30),
            new(settings.LongestShiftMaxSeconds + 9, settings.LongestShiftMaxSeconds + 9), [], []);
        Assert.Equal($"Tuyến cần {settings.LongestShiftMaxSeconds / 60 + 1} phút, Tour dài nhất được {settings.LongestShiftMaxSeconds / 60} phút", block!.Message);
    }

    [Fact]
    public void DatesOf_ListsEveryCampusDateAHoldTouches()
    {
        var lateEvening = TourSchedule.SlotStart(Day, new TimeOnly(23, 30));
        Assert.Equal(new[] { Day }, TourSchedule.DatesOf(Start, Start.AddHours(2)));
        Assert.Equal(new[] { Day, Day.AddDays(1) }, TourSchedule.DatesOf(lateEvening, lateEvening.AddHours(1)));
    }

    [Theory]
    [InlineData("Trình diễn", false, 20, true)]
    [InlineData("  ", false, 20, false)]
    [InlineData("Trình diễn", true, 20, false)]   // A quick Tour has no start of its own (ADR-0053).
    [InlineData(null, false, 20, false)]          // A Tour on a shift needs one.
    [InlineData(null, true, 20, true)]
    [InlineData("Trình diễn", false, 21, false)]
    public void CreateTourInput_IsEitherOnAShift_OrQuickWithAReason(string? reason, bool withStart, int capacity, bool valid) =>
        Assert.Equal(valid, new CreateTourInputValidator(Settings).Validate(
            new CreateTourInput("Tour", null, Guid.NewGuid(), "amr", Guid.NewGuid(), withStart ? Start : (DateTimeOffset?)null, null, capacity, reason)).IsValid);

    private static TourScheduleBlock Block(DateOnly date, string? shift) => new() { Id = Guid.NewGuid(), BlockDate = date, ShiftCode = shift, Reason = "Bảo trì" };

    [Fact]
    public void EvaluateQuickTour_NeedsNoShift_ButKeepsTheRouteAdminAndRobotRules()
    {
        // 12:00, outside every shift; the hold is 12:00 to 13:35.
        var now = TourSchedule.SlotStart(Day, new TimeOnly(12, 0));
        var deadline = now.AddMinutes(60);
        Assert.Null(TourSchedule.EvaluateQuickTour(Settings, now, deadline, Plan, [], []));

        Assert.Null(TourSchedule.EvaluateQuickTour(Settings, now, deadline, new(5400, 5400), [], []));
        Assert.Equal(TourSchedule.RouteTooLongForShift, TourSchedule.EvaluateQuickTour(Settings, now, deadline, new(5401, 5401), [], [])!.Code);

        // An Admin block counts when its day, or its shift, overlaps the hold.
        Assert.Equal(TourSchedule.ShiftBlocked, TourSchedule.EvaluateQuickTour(Settings, now, deadline, Plan, [], [Block(Day, "S2")])!.Code);
        Assert.Equal(TourSchedule.ShiftBlocked, TourSchedule.EvaluateQuickTour(Settings, now, deadline, Plan, [], [Block(Day, null)])!.Code);
        Assert.Null(TourSchedule.EvaluateQuickTour(Settings, now, deadline, Plan, [], [Block(Day, "S1"), Block(Day.AddDays(1), null)]));

        // Another Tour's hold over this one, even one on a shift, keeps the robot.
        var shift = new TourReservationHold("Ca chiều", TourSchedule.SlotStart(Day, new TimeOnly(13, 0)), TourSchedule.SlotStart(Day, new TimeOnly(15, 0)));
        var clash = TourSchedule.EvaluateQuickTour(Settings, now, deadline, Plan, [shift], []);
        Assert.Equal(TourSchedule.ReservationOverlap, clash!.Code);
        Assert.Equal("Robot đang được giữ cho Tour Ca chiều từ 13:00 01/12", clash.Message);
        var ended = new TourReservationHold("Sáng", Start.AddMinutes(-15), now);
        Assert.Null(TourSchedule.EvaluateQuickTour(Settings, now, deadline, Plan, [ended], []));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(72 * 60)]
    public void Settings_RefuseAShortNoticeLeadThatIsNotShorterThanTheStandardOne(int minutes) =>
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings(TourShiftsFixture.Options, 60, shortNoticeMinLeadMinutes: minutes));

    [Fact]
    public void Settings_GiveQuickToursADefaultWait_ThatConfigurationCanChange()
    {
        Assert.Equal(TimeSpan.FromMinutes(30), new TourScheduleSettings(TourShiftsFixture.Options, 60).ShortNoticeMinLead);
        Assert.Equal(TimeSpan.FromMinutes(45), new TourScheduleSettings(TourShiftsFixture.Options, 60, shortNoticeMinLeadMinutes: 45).ShortNoticeMinLead);
    }

    [Fact]
    public void Deadlines_FollowTheTourKind()
    {
        Assert.Equal(Start.AddHours(-48), TourSchedule.RegistrationClosesAt(Start, isShortNotice: false));
        Assert.Equal(Start.AddHours(-24), TourSchedule.ReviewClosesAt(Start, isShortNotice: false));
        Assert.Equal(Start, TourSchedule.RegistrationClosesAt(Start, isShortNotice: true));
        Assert.Equal(Start, TourSchedule.ReviewClosesAt(Start, isShortNotice: true));
    }

    [Theory]
    [InlineData(5400, true)]
    [InlineData(5401, false)]
    public void ATwoHourShift_Accepts5400Seconds_AndRefuses5401(int expected, bool usable)
    {
        var block = TourSchedule.Evaluate(MorningOnDay, LongAgo, new(expected, expected), []);
        Assert.Equal(usable, block is null);
        if (!usable) Assert.Equal(TourSchedule.RouteTooLongForShift, block!.Code);
    }

    [Fact]
    public void ARunOverTheRecommendedLength_CanStillBeScheduled() =>
        Assert.Null(TourSchedule.Evaluate(MorningOnDay, LongAgo, new(4000, 4000), []));

    [Fact]
    public void TheLengthIsCheckedBeforeOverlaps()
    {
        var hold = new TourReservationHold("Tour cũ", Start, Start.AddMinutes(30));
        Assert.Equal(TourSchedule.RouteTooLongForShift, TourSchedule.Evaluate(MorningOnDay, LongAgo, new(6000, 6000), [hold])!.Code);
    }

    [Fact]
    public void AnOlderHoldAtAnOddTimeInsideTheShift_NamesThatTour()
    {
        // An older Tour created at 09:20 holds 09:05-10:05: it reaches into the morning shift.
        var hold = new TourReservationHold("Tour giờ lẻ", Start.AddMinutes(50), Start.AddMinutes(110));
        var block = TourSchedule.Evaluate(MorningOnDay, LongAgo, Plan, [hold]);
        Assert.Equal(TourSchedule.ReservationOverlap, block!.Code);
        Assert.Equal("Trùng khung giữ robot của Tour Tour giờ lẻ", block.Message);
    }

    [Fact]
    public void HoldsThatOnlyTouchTheShift_DoNotClash()
    {
        var (startsAt, endsAt) = TourSchedule.ShiftWindow(Day, Morning);
        Assert.Null(TourSchedule.Evaluate(MorningOnDay, LongAgo, Plan, [
            new("Trước", startsAt.AddHours(-1), startsAt), new("Sau", endsAt, endsAt.AddHours(1))]));
    }

    [Theory]
    [InlineData(TourSchedule.LeadTimeTooShort, "TOUR_LEAD_TIME_TOO_SHORT")]
    [InlineData(TourSchedule.RouteTooLongForShift, "ROUTE_TOO_LONG_FOR_SHIFT")]
    [InlineData(TourSchedule.ReservationOverlap, "ROBOT_RESERVATION_CONFLICT")]
    public void EveryShiftReasonRefusesCreateWithItsConflictCode(string reason, string code) =>
        Assert.Equal(code, Assert.Throws<ConflictException>(() => TourSchedule.EnsureUsable(new(reason, "Lý do"))).Code);

    [Theory]
    [InlineData(null, "UNKNOWN")]
    [InlineData(3600, "FITS")]
    [InlineData(3601, "OVER_RECOMMENDED")]
    [InlineData(5400, "OVER_RECOMMENDED")]
    [InlineData(5401, "TOO_LONG_FOR_SHIFT")]
    public void ScheduleFit_ComparesTheExpectedLengthWithTheRecommendationAndTheLongestShift(int? expected, string fit) =>
        Assert.Equal(fit, TourSchedule.ScheduleFit(Settings, expected));

    [Fact]
    public void SlotAndShiftRangesAreAtMost31Days()
    {
        var slots = new GetTourSlotsQueryValidator();
        Assert.True(slots.Validate(new GetTourSlotsQuery(Guid.NewGuid(), "amr", Day, Day.AddDays(30))).IsValid);
        Assert.False(slots.Validate(new GetTourSlotsQuery(Guid.NewGuid(), "amr", Day, Day.AddDays(31))).IsValid);
        Assert.False(slots.Validate(new GetTourSlotsQuery(Guid.NewGuid(), "amr", Day, Day.AddDays(-1))).IsValid);
        var shifts = new GetTourShiftsQueryValidator();
        Assert.True(shifts.Validate(new GetTourShiftsQuery(Day, Day.AddDays(30))).IsValid);
        Assert.False(shifts.Validate(new GetTourShiftsQuery(Day, Day.AddDays(31))).IsValid);
    }

    [Fact]
    public void AnAdminBlock_ComesAfterTheLength_AndBeforeOverlaps()
    {
        var closed = new TourShiftBlockView(Guid.NewGuid(), ScheduleBlockScope.Shift, "Bảo trì");
        var hold = new TourReservationHold("Tour cũ", Start, Start.AddMinutes(30));
        var block = TourSchedule.Evaluate(MorningOnDay, LongAgo, Plan, [hold], closed);
        Assert.Equal(TourSchedule.ShiftBlocked, block!.Code);
        Assert.Equal("Ca này đã bị khoá: Bảo trì", block.Message);
        Assert.Equal(TourSchedule.RouteTooLongForShift, TourSchedule.Evaluate(MorningOnDay, LongAgo, new(6000, 6000), [], closed)!.Code);
        Assert.Equal(TourSchedule.LeadTimeTooShort, TourSchedule.Evaluate(MorningOnDay, Start, Plan, [], closed)!.Code);
        Assert.Equal("SHIFT_BLOCKED", Assert.Throws<ConflictException>(() => TourSchedule.EnsureUsable(block)).Code);
    }

    [Fact]
    public void BlockOf_FindsTheDayBlockFirst_ThenTheShifts_OnThatDateOnly()
    {
        var afternoon = new TourShiftOnDay(Day, Settings.Shifts[1]);
        TourScheduleBlock Block(string? code, DateOnly date) => new() { Id = Guid.NewGuid(), BlockDate = date, ShiftCode = code, Reason = "Lý do" };
        Assert.Null(TourSchedule.BlockOf([Block("S1", Day), Block(null, Day.AddDays(1))], afternoon));
        Assert.Equal(ScheduleBlockScope.Shift, TourSchedule.BlockOf([Block("S2", Day)], afternoon)!.Scope);
        Assert.Equal(ScheduleBlockScope.Day, TourSchedule.BlockOf([Block("S2", Day), Block(null, Day)], afternoon)!.Scope);
    }

    [Fact]
    public async Task ShiftCalendar_ListsEachConfiguredShiftOfEachDay_WithItsBlock()
    {
        var closed = new TourScheduleBlock { Id = Guid.NewGuid(), BlockDate = Day, ShiftCode = "S1", Reason = "Bảo trì" };
        var view = await new GetTourShiftsQueryHandler(Settings, new StubBlocks([closed])).Handle(new(Day, Day.AddDays(1)), default);
        Assert.Equal(2, view.Days.Count);
        var morning = view.Days[0].Shifts[0];
        Assert.Equal(("S1", "Ca sáng", "08:15", 5400), (morning.Code, morning.Name, morning.Time, morning.MaxDurationSeconds));
        Assert.Equal(TourSchedule.ShiftWindow(Day, Morning), (morning.StartsAt, morning.EndsAt));
        Assert.Equal(new TourShiftBlockView(closed.Id, ScheduleBlockScope.Shift, "Bảo trì"), morning.Block);
        Assert.Null(view.Days[0].Shifts[1].Block);
        Assert.Equal(["S1", "S2", "S3"], view.Days[1].Shifts.Select(shift => shift.Code));
        Assert.Equal(3600, view.RecommendedMaxSeconds);
    }

    private sealed class StubBlocks(IReadOnlyList<TourScheduleBlock> active) : IScheduleBlockRepository
    {
        public Task<IReadOnlyList<TourScheduleBlock>> ListActiveAsync(DateOnly from, DateOnly to, CancellationToken ct) => Task.FromResult(active);
        public Task LockDateAsync(DateOnly date, CancellationToken ct) => throw new NotImplementedException();
        public Task LockRequestAsync(Guid actor, Guid requestId, CancellationToken ct) => throw new NotImplementedException();
        public Task<AuditLog?> FindRequestAsync(Guid actor, Guid requestId, CancellationToken ct) => throw new NotImplementedException();
        public Task<DateOnly?> FindDateAsync(Guid id, CancellationToken ct) => throw new NotImplementedException();
        public Task<TourScheduleBlock?> FindAsync(Guid id, CancellationToken ct) => throw new NotImplementedException();
        public Task<IReadOnlyList<ScheduleBlockingTour>> ListToursInWindowAsync(DateTimeOffset startsAt, DateTimeOffset endsAt, CancellationToken ct) => throw new NotImplementedException();
        public void Add(TourScheduleBlock block) => throw new NotImplementedException();
        public void AddAudit(AuditLog audit) => throw new NotImplementedException();
    }
}
