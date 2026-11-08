using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;

namespace SmartCampus.UnitTests;

public sealed class TourScheduleTests
{
    private static readonly TourScheduleSettings Settings = new(["14:00", "09:00", "10:00", "15:00"], "08:00", "17:00");
    private static readonly TourReservationPlan Plan = new(1200, 1200);
    private static readonly DateOnly Day = new(2026, 12, 1);
    private static readonly DateTimeOffset Start = TourSchedule.SlotStart(Day, new TimeOnly(9, 0));
    private static readonly DateTimeOffset LongAgo = Start.AddDays(-30);

    [Fact]
    public void Settings_SortSlots_AndRefuseNoneOrBadTimes()
    {
        Assert.Equal([new(9, 0), new(10, 0), new(14, 0), new(15, 0)], Settings.StartSlots);
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings([], "08:00", "17:00"));
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings(null, "08:00", "17:00"));
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings(["9am"], "08:00", "17:00"));
    }

    [Theory]
    [InlineData(null, "17:00")]
    [InlineData("8am", "17:00")]
    [InlineData("17:00", "08:00")]  // Backwards.
    [InlineData("08:00", "08:00")]  // Empty.
    public void Settings_RefuseUnusableCustomHours(string? earliest, string? latest) =>
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings(["09:00"], earliest, latest));

    [Theory]
    [InlineData(8, 0)]      // Both edges are inside.
    [InlineData(13, 37)]
    [InlineData(17, 0)]
    public void CustomHours_AllowAnyWholeMinute(int hour, int minute) =>
        Assert.Null(TourSchedule.StartRule(Settings, TourSchedule.SlotStart(Day, new TimeOnly(hour, minute))));

    [Theory]
    [InlineData(7, 59)]
    [InlineData(17, 1)]
    [InlineData(1, 0)]
    public void CustomHours_RefuseStartsOutside(int hour, int minute)
    {
        var block = TourSchedule.StartRule(Settings, TourSchedule.SlotStart(Day, new TimeOnly(hour, minute)));
        Assert.Equal(TourSchedule.OutsideStartHours, block?.Code);
        Assert.Equal("Ngoài giờ cho phép, chọn từ 08:00 đến 17:00", block?.Message);
    }

    [Fact]
    public void CustomHours_ReadVietnamTime_AndRefusePartMinutes()
    {
        // 03:30 UTC is 10:30 in Vietnam, and 12:00 UTC, inside the hours on a UTC clock, is 19:00 in Vietnam.
        Assert.Null(TourSchedule.StartRule(Settings, new DateTimeOffset(2026, 12, 1, 3, 30, 0, TimeSpan.Zero)));
        Assert.NotNull(TourSchedule.StartRule(Settings, new DateTimeOffset(2026, 12, 1, 12, 0, 0, TimeSpan.Zero)));
        Assert.NotNull(TourSchedule.StartRule(Settings, TourSchedule.SlotStart(Day, new TimeOnly(13, 37, 30))));
    }

    [Fact]
    public void ConfiguredSlot_StaysAllowedOutsideTheCustomHours()
    {
        var evening = new TourScheduleSettings(["19:00"], "08:00", "17:00");
        Assert.Null(TourSchedule.StartRule(evening, TourSchedule.SlotStart(Day, new TimeOnly(19, 0))));
    }

    [Fact]
    public void SlotIsVietnamTime_StoredAsUtc()
    {
        Assert.Equal(new DateTimeOffset(2026, 12, 1, 2, 0, 0, TimeSpan.Zero), Start);
        Assert.Equal(TimeSpan.Zero, Start.Offset);
        // 15:00 in Vietnam on 1 Dec is 08:00 UTC, and 01:00 Vietnam time would be the previous UTC day.
        Assert.True(TourSchedule.IsConfiguredSlot(Settings, new DateTimeOffset(2026, 12, 1, 8, 0, 0, TimeSpan.Zero)));
        Assert.True(TourSchedule.IsConfiguredSlot(Settings, new DateTimeOffset(2026, 12, 1, 9, 0, 0, TimeSpan.FromHours(7))));
    }

    [Theory]
    [InlineData(9, 1)]      // A minute off the slot.
    [InlineData(9, 30)]
    [InlineData(11, 0)]     // A whole hour that is not configured.
    public void OffSlotStartsAreNotConfigured(int hour, int minute) =>
        Assert.False(TourSchedule.IsConfiguredSlot(Settings, TourSchedule.SlotStart(Day, new TimeOnly(hour, minute))));

    [Fact]
    public void UtcClockTimeMatchingALocalSlot_IsNotASlot() =>
        Assert.False(TourSchedule.IsConfiguredSlot(Settings, new DateTimeOffset(2026, 12, 1, 9, 0, 0, TimeSpan.Zero)));

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
    public void WindowHoldsFifteenMinutesEachSideOfTheExpectedRun()
    {
        var (startsAt, endsAt) = TourSchedule.Window(Start, 1215);
        Assert.Equal(Start.AddMinutes(-15), startsAt);
        Assert.Equal(Start.AddSeconds(1215).AddMinutes(15), endsAt);
    }

    [Fact]
    public void LeadTime_AcceptsExactly72Hours_AndRefuses71Hours59Minutes()
    {
        Assert.Null(TourSchedule.Evaluate(Start, Start.AddHours(-72), Settings.LeadTime, Plan, []));
        var block = TourSchedule.Evaluate(Start, Start.AddHours(-72).AddMinutes(1), Settings.LeadTime, Plan, []);
        Assert.Equal(TourSchedule.LeadTimeTooShort, block!.Code);
        Assert.Equal("Quá gần hiện tại, cần tạo trước ít nhất 72 giờ", block.Message);
    }

    [Fact]
    public void Settings_DefaultTo72HourLeadAnd48HourRegistrationClose()
    {
        Assert.Equal(TimeSpan.FromHours(72), Settings.LeadTime);
        Assert.Equal(TimeSpan.FromHours(48), Settings.RegistrationClose);
    }

    [Fact]
    public void ConfiguredLeadTime_AllowsASameDayTour_AndNamesTheConfiguredHours()
    {
        var demo = new TourScheduleSettings(["09:00"], "08:00", "17:00", leadTimeHours: 2, registrationCloseHours: 1);
        Assert.Null(TourSchedule.Evaluate(Start, Start.AddHours(-2), demo.LeadTime, Plan, []));
        var block = TourSchedule.Evaluate(Start, Start.AddHours(-2).AddMinutes(1), demo.LeadTime, Plan, []);
        Assert.Equal("Quá gần hiện tại, cần tạo trước ít nhất 2 giờ", block!.Message);
    }

    [Theory]
    [InlineData(48, 48)]  // A Tour created at the minimum lead time would be born with registration closed.
    [InlineData(1, 2)]
    [InlineData(2, -1)]
    public void Settings_RefuseALeadTimeNotAfterTheRegistrationClose(int lead, int close) =>
        Assert.Throws<InvalidOperationException>(() =>
            new TourScheduleSettings(["09:00"], "08:00", "17:00", leadTimeHours: lead, registrationCloseHours: close));

    [Fact]
    public void RegistrationCutoff_FollowsTheConfiguredClose()
    {
        var tour = new SmartCampus.Domain.Entities.Tour { ScheduledStartAt = Start };
        var close = TimeSpan.FromHours(1);
        SmartCampus.Application.Features.Registrations.RegistrationCutoff.EnsureNewRowsAllowed(tour, Start.AddHours(-1).AddTicks(-1), close);
        var refused = Assert.Throws<ConflictException>(() =>
            SmartCampus.Application.Features.Registrations.RegistrationCutoff.EnsureNewRowsAllowed(tour, Start.AddHours(-1), close));
        Assert.Equal("REGISTRATION_CUTOFF", refused.Code);
        Assert.Contains("1 giờ", refused.Message);
    }

    [Fact]
    public void RunWithoutAgreedBasisBlocksEveryUsableSlot()
    {
        var block = TourSchedule.Evaluate(Start, LongAgo, Settings.LeadTime, null, []);
        Assert.Equal(TourSchedule.RemeasureRequired, block!.Code);
        Assert.Equal("Cần chạy thử lại tuyến để đo theo định nghĩa mới", block.Message);
    }

    [Fact]
    public void HoldCoveringTheOpeningOfTheWindow_NamesThatTour()
    {
        var hold = new TourReservationHold("Tour sáng", Start.AddMinutes(-60), Start.AddMinutes(-10));
        var block = TourSchedule.Evaluate(Start, LongAgo, Settings.LeadTime, Plan, [hold]);
        Assert.Equal(TourSchedule.ReservationOverlap, block!.Code);
        Assert.Equal("Trùng khung giữ robot của Tour Tour sáng", block.Message);
    }

    [Fact]
    public void HoldBeginningInsideTheWindow_MeansTheRouteDoesNotFitTheGap()
    {
        var hold = new TourReservationHold("Tour sau", Start.AddMinutes(30), Start.AddMinutes(90));
        var block = TourSchedule.Evaluate(Start, LongAgo, Settings.LeadTime, Plan, [hold]);
        Assert.Equal(TourSchedule.RouteTooLongForGap, block!.Code);
        Assert.Equal("Tuyến dài hơn khoảng trống còn lại", block.Message);
    }

    [Fact]
    public void WindowsThatOnlyTouch_DoNotClash()
    {
        var (startsAt, endsAt) = TourSchedule.Window(Start, Plan.ExpectedDurationSeconds);
        Assert.Null(TourSchedule.Evaluate(Start, LongAgo, Settings.LeadTime, Plan, [
            new("Trước", startsAt.AddHours(-1), startsAt), new("Sau", endsAt, endsAt.AddHours(1))]));
    }

    [Theory]
    [InlineData(TourSchedule.LeadTimeTooShort, "TOUR_LEAD_TIME_TOO_SHORT")]
    [InlineData(TourSchedule.RemeasureRequired, "ROUTE_TEST_REMEASURE_REQUIRED")]
    [InlineData(TourSchedule.ReservationOverlap, "ROBOT_RESERVATION_CONFLICT")]
    [InlineData(TourSchedule.RouteTooLongForGap, "ROBOT_RESERVATION_CONFLICT")]
    public void EverySlotReasonRefusesCreateWithItsConflictCode(string reason, string code) =>
        Assert.Equal(code, Assert.Throws<ConflictException>(() => TourSchedule.EnsureUsable(new(reason, "Lý do"))).Code);

    [Fact]
    public void SlotRangeIsAtMost31Days()
    {
        var validator = new GetTourSlotsQueryValidator();
        Assert.True(validator.Validate(new GetTourSlotsQuery(Guid.NewGuid(), "amr", Day, Day.AddDays(30))).IsValid);
        Assert.False(validator.Validate(new GetTourSlotsQuery(Guid.NewGuid(), "amr", Day, Day.AddDays(31))).IsValid);
        Assert.False(validator.Validate(new GetTourSlotsQuery(Guid.NewGuid(), "amr", Day, Day.AddDays(-1))).IsValid);
    }
}
