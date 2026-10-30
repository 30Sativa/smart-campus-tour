using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;

namespace SmartCampus.UnitTests;

public sealed class TourScheduleTests
{
    private static readonly TourScheduleSettings Settings = new(["14:00", "09:00", "10:00", "15:00"]);
    private static readonly TourReservationPlan Plan = new(1200, 1200);
    private static readonly DateOnly Day = new(2026, 12, 1);
    private static readonly DateTimeOffset Start = TourSchedule.SlotStart(Day, new TimeOnly(9, 0));
    private static readonly DateTimeOffset LongAgo = Start.AddDays(-30);

    [Fact]
    public void Settings_SortSlots_AndRefuseNoneOrBadTimes()
    {
        Assert.Equal([new(9, 0), new(10, 0), new(14, 0), new(15, 0)], Settings.StartSlots);
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings([]));
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings(null));
        Assert.Throws<InvalidOperationException>(() => new TourScheduleSettings(["9am"]));
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
        Assert.Null(TourSchedule.Evaluate(Start, Start.AddHours(-72), Plan, []));
        var block = TourSchedule.Evaluate(Start, Start.AddHours(-72).AddMinutes(1), Plan, []);
        Assert.Equal(TourSchedule.LeadTimeTooShort, block!.Code);
        Assert.Equal("Quá gần hiện tại, cần tạo trước ít nhất 72 giờ", block.Message);
    }

    [Fact]
    public void RunWithoutAgreedBasisBlocksEveryUsableSlot()
    {
        var block = TourSchedule.Evaluate(Start, LongAgo, null, []);
        Assert.Equal(TourSchedule.RemeasureRequired, block!.Code);
        Assert.Equal("Cần chạy thử lại tuyến để đo theo định nghĩa mới", block.Message);
    }

    [Fact]
    public void HoldCoveringTheOpeningOfTheWindow_NamesThatTour()
    {
        var hold = new TourReservationHold("Tour sáng", Start.AddMinutes(-60), Start.AddMinutes(-10));
        var block = TourSchedule.Evaluate(Start, LongAgo, Plan, [hold]);
        Assert.Equal(TourSchedule.ReservationOverlap, block!.Code);
        Assert.Equal("Trùng khung giữ robot của Tour Tour sáng", block.Message);
    }

    [Fact]
    public void HoldBeginningInsideTheWindow_MeansTheRouteDoesNotFitTheGap()
    {
        var hold = new TourReservationHold("Tour sau", Start.AddMinutes(30), Start.AddMinutes(90));
        var block = TourSchedule.Evaluate(Start, LongAgo, Plan, [hold]);
        Assert.Equal(TourSchedule.RouteTooLongForGap, block!.Code);
        Assert.Equal("Tuyến dài hơn khoảng trống còn lại", block.Message);
    }

    [Fact]
    public void WindowsThatOnlyTouch_DoNotClash()
    {
        var (startsAt, endsAt) = TourSchedule.Window(Start, Plan.ExpectedDurationSeconds);
        Assert.Null(TourSchedule.Evaluate(Start, LongAgo, Plan, [
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
