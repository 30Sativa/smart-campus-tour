using SmartCampus.Application.Features.Tours;

namespace SmartCampus.UnitTests;

public sealed class TourAutoCancelTests
{
    private static readonly DateTimeOffset Start = new(2026, 11, 7, 8, 15, 0, TimeSpan.FromHours(7));
    private static readonly TimeSpan Late = TimeSpan.FromMinutes(15);

    [Fact]
    public void HoldEnd_IsTheReservationEnd()
    {
        var endsAt = new DateTimeOffset(2026, 11, 7, 10, 0, 0, TimeSpan.FromHours(7));
        Assert.Equal(endsAt, TourAutoCancel.HoldEndsAt(Start, endsAt, Late));
    }

    [Fact]
    public void WithoutReservation_HoldEndsWhenTheStartWindowCloses() =>
        Assert.Equal(Start + Late, TourAutoCancel.HoldEndsAt(Start, null, Late));

    [Fact]
    public void AnEarlyReservationEnd_NeverCutsTheStartWindowShort() =>
        Assert.Equal(Start + Late, TourAutoCancel.HoldEndsAt(Start, Start.AddMinutes(5), Late));

    [Fact]
    public void SystemCancel_EmailsTheFixedSentence_InsteadOfTheStoredReason() =>
        Assert.Equal("Buổi tham quan không bắt đầu đúng giờ nên đã bị huỷ. Đại học FPT sẽ liên hệ nếu sắp xếp lại.",
            TourAutoCancel.NoticeReason(null, TourAutoCancel.Reason));

    [Theory]
    [InlineData("Robot cần bảo trì")]
    [InlineData(TourAutoCancel.Reason)]
    public void StaffCancel_EmailsTheReasonAsEntered(string reason) =>
        Assert.Equal(reason, TourAutoCancel.NoticeReason(Guid.NewGuid(), reason));

    [Fact]
    public void MissingReason_IsEmpty() => Assert.Equal("", TourAutoCancel.NoticeReason(null, null));

    private static TourSummary Summary(string state, TourReservationView? reservation) => new(Guid.NewGuid(), "Tour", null,
        Guid.NewGuid(), "Route", Guid.NewGuid(), Start, state, Guid.NewGuid(), Start.AddHours(-1), null, "AA==", 0, 0, null, reservation);

    private static TourReservationView Hold(DateTimeOffset endsAt, DateTimeOffset? releasedAt = null) =>
        new("R1", Start.AddMinutes(-10), endsAt, 300, releasedAt, 300);

    [Theory]
    [InlineData("SCHEDULED")]
    [InlineData("READY")]
    public void Deadlines_AreTheLastStartMinute_AndTheEndOfTheHold(string state)
    {
        // The A3 case: published 19:14, Start until 19:29, hold (and auto-cancel) until 19:34.
        var tour = TourAutoCancel.WithDeadlines(Summary(state, Hold(Start.AddMinutes(20))), Late);
        Assert.Equal(Start.AddMinutes(15), tour.LatestStartAt);
        Assert.Equal(Start.AddMinutes(20), tour.AutoCancelAt);
    }

    [Fact]
    public void Deadlines_WithoutAnActiveHold_CancelWhenTheStartWindowCloses()
    {
        Assert.Equal(Start + Late, TourAutoCancel.WithDeadlines(Summary("SCHEDULED", null), Late).AutoCancelAt);
        Assert.Equal(Start + Late, TourAutoCancel.WithDeadlines(Summary("SCHEDULED", Hold(Start.AddHours(2), Start)), Late).AutoCancelAt);
    }

    [Theory]
    [InlineData("RUNNING")]
    [InlineData("COMPLETED")]
    [InlineData("CANCELLED")]
    public void Deadlines_AreNull_OnceTheTourStartedOrEnded(string state)
    {
        var tour = TourAutoCancel.WithDeadlines(Summary(state, Hold(Start.AddMinutes(20))), Late);
        Assert.Null(tour.LatestStartAt);
        Assert.Null(tour.AutoCancelAt);
    }
}
