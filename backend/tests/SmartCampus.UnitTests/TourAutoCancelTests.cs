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
}
