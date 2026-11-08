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
}
