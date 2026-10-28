using SmartCampus.Application.Features.Invitations;

namespace SmartCampus.UnitTests;

public sealed class ViewerReconnectPolicyTests
{
    [Fact]
    public void GraceIsInclusiveAtTwoMinutesAndIndependentOfIdleLease()
    {
        var now = new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero);

        Assert.True(ViewerReconnectPolicy.IsWithinGrace(now.AddMinutes(-2), now));
        Assert.True(ViewerReconnectPolicy.IsWithinGrace(now.AddMinutes(-1), now));
        Assert.False(ViewerReconnectPolicy.IsWithinGrace(now.AddTicks(-TimeSpan.FromMinutes(2).Ticks - 1), now));
        Assert.False(ViewerReconnectPolicy.IsWithinGrace(null, now));
    }
}
