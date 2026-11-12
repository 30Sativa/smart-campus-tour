using SmartCampus.Application.Features.FleetCamera;
using SmartCampus.Infrastructure.Integrations.FleetCamera;

namespace SmartCampus.IntegrationTests;

/// <summary>ADR-0052 in-memory camera demand: monotonic per robot, robot codes case-insensitive.</summary>
public sealed class CameraDemandStoreTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 9, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Lease_OnlyGrows_AndIgnoresCase()
    {
        var store = new InMemoryCameraDemandStore();
        Assert.Null(store.GetLease("amr_01"));
        Assert.Equal(Now.AddMinutes(2), store.ExtendLease("amr_01", Now.AddMinutes(2)));
        Assert.Equal(Now.AddMinutes(2), store.ExtendLease("AMR_01", Now.AddMinutes(1)));
        Assert.Equal(Now.AddMinutes(3), store.ExtendLease("amr_01", Now.AddMinutes(3)));
        Assert.Equal(Now.AddMinutes(3), store.GetLease("Amr_01"));
        Assert.Null(store.GetLease("amr_02"));
    }

    [Fact]
    public void Poll_KeepsTheLatest()
    {
        var store = new InMemoryCameraDemandStore();
        Assert.Null(store.GetLastPoll("amr_01"));
        store.RecordPoll("amr_01", Now);
        store.RecordPoll("amr_01", Now.AddSeconds(-5));
        Assert.Equal(Now, store.GetLastPoll("AMR_01"));
    }

    [Fact]
    public async Task ConcurrentLeases_KeepTheLatestEnd()
    {
        var store = new InMemoryCameraDemandStore();
        await Task.WhenAll(Enumerable.Range(1, 200).Select(i => Task.Run(() => store.ExtendLease("amr_01", Now.AddSeconds(i)))));
        Assert.Equal(Now.AddSeconds(200), store.GetLease("amr_01"));
    }

    [Fact]
    public void Headset_TheLatestReportWins_AndCaseIsIgnored()
    {
        var store = new InMemoryCameraDemandStore();
        Assert.Null(store.GetHeadset("amr_01"));
        store.RecordHeadset("amr_01", new HeadsetReport("connected", 60, false, "live"), Now);
        store.RecordHeadset("AMR_01", new HeadsetReport("offline", null, null, "lost"), Now.AddSeconds(-5));
        Assert.Equal(60, store.GetHeadset("Amr_01")!.Value.Report.BatteryPercent);
        store.RecordHeadset("amr_01", new HeadsetReport("connected", 59, true, "live"), Now.AddSeconds(5));
        Assert.Equal((new HeadsetReport("connected", 59, true, "live"), Now.AddSeconds(5)), store.GetHeadset("amr_01")!.Value);
    }

    [Fact]
    public void HeadsetCommand_IsTakenOnce_TheLatestWins_AndAnExpiredOneIsDropped()
    {
        var store = new InMemoryCameraDemandStore();
        Assert.Null(store.TakeHeadsetCommand("amr_01", Now));

        store.QueueHeadsetCommand("amr_01", new HeadsetCommand(Guid.NewGuid(), HeadsetActions.Wake, Now, Now.AddSeconds(20)));
        var sleep = new HeadsetCommand(Guid.NewGuid(), HeadsetActions.Sleep, Now, Now.AddSeconds(20));
        store.QueueHeadsetCommand("AMR_01", sleep);
        Assert.Equal(sleep, store.TakeHeadsetCommand("Amr_01", Now.AddSeconds(1)));
        Assert.Null(store.TakeHeadsetCommand("amr_01", Now.AddSeconds(1)));

        store.QueueHeadsetCommand("amr_01", new HeadsetCommand(Guid.NewGuid(), HeadsetActions.Wake, Now, Now.AddSeconds(20)));
        Assert.Null(store.TakeHeadsetCommand("amr_01", Now.AddSeconds(20)));
        Assert.Null(store.TakeHeadsetCommand("amr_01", Now));
    }
}
