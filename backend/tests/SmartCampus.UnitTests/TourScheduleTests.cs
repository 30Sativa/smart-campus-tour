using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateQuickTour;
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

    [Fact]
    public void AddedDwellLengthensTheMeasuredRun() =>
        Assert.Equal(1215, TourSchedule.ExpectedDurationSeconds(1200, [(1, 30)], [(1, 45)]));

    [Fact]
    public void ShortenedDwellNeverShortensTheMeasuredRun() =>
        Assert.Equal(1200, TourSchedule.ExpectedDurationSeconds(1200, [(1, 45)], [(1, 10)]));

    [Fact]
    public void DwellIsComparedStopByStop_NotAsATotal() =>
        // The total dwell is unchanged, yet stop 2 runs 20 s longer and only that counts.
        Assert.Equal(1220, TourSchedule.ExpectedDurationSeconds(1200, [(1, 50), (2, 30)], [(1, 30), (2, 50)]));

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
    public void DatesOf_ListsEveryCampusDateAHoldTouches()
    {
        var lateEvening = TourSchedule.SlotStart(Day, new TimeOnly(23, 30));
        Assert.Equal(new[] { Day }, TourSchedule.DatesOf(Start, Start.AddHours(2)));
        Assert.Equal(new[] { Day, Day.AddDays(1) }, TourSchedule.DatesOf(lateEvening, lateEvening.AddHours(1)));
    }

    [Theory]
    [InlineData("Trình diễn", 20, true)]
    [InlineData("  ", 20, false)]
    [InlineData("", 20, false)]
    [InlineData("Trình diễn", 0, false)]
    [InlineData("Trình diễn", 21, false)]
    public void QuickTourInput_NeedsAReason_AndACapacityInRange(string reason, int capacity, bool valid) =>
        Assert.Equal(valid, new QuickTourInputValidator(Settings).Validate(
            new QuickTourInput("Tour nhanh", null, Guid.NewGuid(), "amr", Guid.NewGuid(), null, capacity, reason)).IsValid);

    private static TourScheduleBlock Block(DateOnly date, string? shift) => new() { Id = Guid.NewGuid(), BlockDate = date, ShiftCode = shift, Reason = "Bảo trì" };

    [Fact]
    public void EvaluateQuickTour_NeedsNoShift_ButKeepsTheRouteAdminAndRobotRules()
    {
        // 12:00, outside every shift; the hold is 12:00 to 13:35.
        var now = TourSchedule.SlotStart(Day, new TimeOnly(12, 0));
        var deadline = now.AddMinutes(60);
        Assert.Null(TourSchedule.EvaluateQuickTour(Settings, now, deadline, Plan, [], []));

        Assert.Equal(TourSchedule.RemeasureRequired, TourSchedule.EvaluateQuickTour(Settings, now, deadline, null, [], [])!.Code);
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
    public void Settings_LeaveShortNoticeOffUntilConfigured()
    {
        Assert.Null(new TourScheduleSettings(TourShiftsFixture.Options, 60).ShortNoticeMinLead);
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

    [Fact]
    public void RunWithoutAgreedBasisBlocksEveryUsableShift()
    {
        var block = TourSchedule.Evaluate(MorningOnDay, LongAgo, null, []);
        Assert.Equal(TourSchedule.RemeasureRequired, block!.Code);
        Assert.Equal("Cần chạy thử lại tuyến để đo theo định nghĩa mới", block.Message);
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
    [InlineData(TourSchedule.RemeasureRequired, "ROUTE_TEST_REMEASURE_REQUIRED")]
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
