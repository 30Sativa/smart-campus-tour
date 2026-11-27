using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;

namespace SmartCampus.UnitTests;

public sealed class TourOperatorPresenceTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 27, 3, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(299, false)]
    [InlineData(300, true)]
    [InlineData(301, true)]
    [InlineData(-1, false)]
    public void BackupEligibility_HasAnInclusiveThreshold(int seconds, bool allowed) =>
        Assert.Equal(allowed, TourOperatorPresencePolicy.CanEndAsBackup(Now.AddSeconds(-seconds), Now, 5));

    [Fact]
    public void LegacyNullContact_AllowsBackup() => Assert.True(TourOperatorPresencePolicy.CanEndAsBackup(null, Now, 5));

    [Fact]
    public void ConnectedRefusal_CarriesCampusTimeAndMachineReadableDeadlines()
    {
        var last = Now.AddSeconds(-299);
        var error = Assert.Throws<ConflictException>(() => TourOperatorPresencePolicy.EnsureBackupAllowed(last, Now, 5));
        Assert.Equal("OPERATOR_STILL_CONNECTED", error.Code);
        Assert.Contains(last.ToOffset(TimeSpan.FromHours(7)).ToString("HH:mm:ss"), error.Message);
        Assert.Equal(last, DateTimeOffset.Parse(Assert.Single(error.FieldErrors!["operatorLastSeenAt"])));
        Assert.Equal(last.AddMinutes(5), DateTimeOffset.Parse(Assert.Single(error.FieldErrors["allowedAt"])));
    }

    [Fact]
    public void Setting_DefaultsToFive_AndAcceptsAConfiguredPositiveInterval()
    {
        Assert.Equal(5, TourShiftsFixture.Settings.OperatorDisconnectEndEarlyMinutes);
        Assert.Equal(2, new TourScheduleSettings(TourShiftsFixture.Options, 60, operatorDisconnectEndEarlyMinutes: 2).OperatorDisconnectEndEarlyMinutes);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Setting_RejectsNonPositiveIntervals(int minutes) => Assert.Throws<InvalidOperationException>(() =>
        new TourScheduleSettings(TourShiftsFixture.Options, 60, operatorDisconnectEndEarlyMinutes: minutes));
}
