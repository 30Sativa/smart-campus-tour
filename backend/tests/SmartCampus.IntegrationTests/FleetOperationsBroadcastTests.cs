using System.Reflection;
using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using SmartCampus.Api.Hubs;
using SmartCampus.Api.Controllers;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.FleetSync.Commands.SyncFleetTelemetry;
using SmartCampus.Infrastructure.Integrations.FleetSync;

namespace SmartCampus.IntegrationTests;

public sealed class FleetOperationsBroadcastTests
{
    [Fact]
    public async Task AcceptedTelemetry_IsQueuedAfterTheRequestIsCanceled()
    {
        var now = DateTimeOffset.UtcNow;
        var store = new InMemoryFleetTelemetryStore();
        using var requestAborted = new CancellationTokenSource();
        var sender = DispatchProxy.Create<ISender, AcceptThenCancelSender>();
        ((AcceptThenCancelSender)(object)sender).Initialize(store, requestAborted, now);
        var settings = Settings(broadcastInterval: TimeSpan.FromHours(1));
        var proxy = new TestClientProxy((_, _, _) => Task.CompletedTask);
        var broadcaster = CreateBroadcaster(proxy, store, settings, new MutableTimeProvider(now));
        var controller = new FleetSyncController(sender, broadcaster)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                    [
                        new Claim(FleetRobotAuthentication.RobotCodeClaim, "robot_test_01"),
                        new Claim(FleetRobotAuthentication.SourceTypeClaim, "PHYSICAL"),
                        new Claim(FleetRobotAuthentication.NeedsInspectionClaim, "False")
                    ], FleetRobotAuthentication.Scheme))
                }
            }
        };
        controller.HttpContext.Items[FleetRobotAuthentication.RequestProofItemKey] = new FleetRobotAuthenticationProof(
            new FleetRobotIdentity("robot_test_01", "PHYSICAL", null, false), new byte[32]);

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await controller.Sync(new FleetSyncRequest(
            "robot_test_01", Guid.NewGuid(), 1, now, "test-map", "map", null,
            "IDLE", null, null, null, null, null), requestAborted.Token);

        Assert.True(requestAborted.IsCancellationRequested);
        Assert.True(await broadcaster.WaitForTelemetryUpdateAsync(timeout.Token));
        Assert.Equal(1, Assert.Single(store.GetLatest()).Report.Seq);
    }

    [Fact]
    public async Task TelemetryNotification_IsRetriedAfterBroadcastFailureWithoutRequestCancellation()
    {
        var now = DateTimeOffset.UtcNow;
        var store = new InMemoryFleetTelemetryStore();
        await store.ApplyAsync(Snapshot(Guid.NewGuid(), 1, now, now), CancellationToken.None);
        var attempts = 0;
        var delivered = new TaskCompletionSource<FleetOperationsRobot[]>(TaskCreationOptions.RunContinuationsAsynchronously);
        var proxy = new TestClientProxy(async (method, args, cancellationToken) =>
        {
            Assert.Equal("FleetUpdated", method);
            if (Interlocked.Increment(ref attempts) == 1)
                throw new IOException("Transient SignalR send failure.");

            cancellationToken.ThrowIfCancellationRequested();
            delivered.TrySetResult(Assert.IsType<FleetOperationsRobot[]>(args[0]));
        });
        var settings = Settings(
            broadcastInterval: TimeSpan.FromHours(1),
            broadcastTimeout: TimeSpan.FromMilliseconds(100),
            retryDelay: TimeSpan.FromMilliseconds(10));
        var broadcaster = CreateBroadcaster(proxy, store, settings, new MutableTimeProvider(now));
        using var hostStopping = new CancellationTokenSource();
        var monitor = new FleetFreshnessMonitor(broadcaster, settings, NullLogger<FleetFreshnessMonitor>.Instance);

        await monitor.StartAsync(hostStopping.Token);
        try
        {
            // A request cancellation token is not accepted by this notification API.
            broadcaster.NotifyTelemetryUpdated();
            var projection = await delivered.Task.WaitAsync(TimeSpan.FromSeconds(3));

            Assert.True(Volatile.Read(ref attempts) >= 2);
            Assert.Equal(1, Assert.Single(projection).Seq);
        }
        finally
        {
            hostStopping.Cancel();
            await monitor.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task TelemetryNotification_RetriesAfterSlowClientSendTimesOut()
    {
        var now = DateTimeOffset.UtcNow;
        var store = new InMemoryFleetTelemetryStore();
        await store.ApplyAsync(Snapshot(Guid.NewGuid(), 1, now, now), CancellationToken.None);
        var attempts = 0;
        var delivered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var proxy = new TestClientProxy(async (_, _, cancellationToken) =>
        {
            if (Interlocked.Increment(ref attempts) == 1)
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);

            delivered.TrySetResult();
        });
        var settings = Settings(
            broadcastInterval: TimeSpan.FromHours(1),
            broadcastTimeout: TimeSpan.FromMilliseconds(50),
            retryDelay: TimeSpan.FromMilliseconds(10));
        var broadcaster = CreateBroadcaster(proxy, store, settings, new MutableTimeProvider(now));
        using var hostStopping = new CancellationTokenSource();
        var monitor = new FleetFreshnessMonitor(broadcaster, settings, NullLogger<FleetFreshnessMonitor>.Instance);

        await monitor.StartAsync(hostStopping.Token);
        try
        {
            broadcaster.NotifyTelemetryUpdated();
            await delivered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.True(Volatile.Read(ref attempts) >= 2);
        }
        finally
        {
            hostStopping.Cancel();
            await monitor.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task FreshnessBroadcast_RefreshesAgeFieldsAtTheConfiguredInterval()
    {
        var now = DateTimeOffset.UtcNow;
        var clock = new MutableTimeProvider(now);
        var store = new InMemoryFleetTelemetryStore();
        await store.ApplyAsync(Snapshot(Guid.NewGuid(), 1, now, now), CancellationToken.None);
        var sends = new List<FleetOperationsRobot[]>();
        var proxy = new TestClientProxy((_, args, _) =>
        {
            sends.Add(Assert.IsType<FleetOperationsRobot[]>(args[0]));
            return Task.CompletedTask;
        });
        var settings = Settings(broadcastInterval: TimeSpan.FromSeconds(5));
        var broadcaster = CreateBroadcaster(proxy, store, settings, clock);

        Assert.True(await broadcaster.PublishFreshnessChangesAsync(CancellationToken.None));
        clock.Advance(TimeSpan.FromSeconds(5));
        Assert.True(await broadcaster.PublishFreshnessChangesAsync(CancellationToken.None));

        Assert.Equal(2, sends.Count);
        Assert.True(Assert.Single(sends[1]).TelemetryAgeSeconds > Assert.Single(sends[0]).TelemetryAgeSeconds);
    }

    private static FleetOperationsBroadcaster CreateBroadcaster(
        IClientProxy client,
        IFleetTelemetryStore store,
        FleetSyncSettings settings,
        TimeProvider clock) => new(
            new TestHubContext(client), store, settings, clock, NullLogger<FleetOperationsBroadcaster>.Instance);

    private static FleetSyncSettings Settings(
        TimeSpan? broadcastInterval = null,
        TimeSpan? broadcastTimeout = null,
        TimeSpan? retryDelay = null) => new(
            new Dictionary<string, FleetRobotMapContext> { ["robot_test_01"] = new("test-map", "map") },
            TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(30),
            TimeSpan.FromSeconds(5), broadcastInterval ?? TimeSpan.FromSeconds(5),
            broadcastTimeout, retryDelay);

    private static FleetTelemetrySnapshot Snapshot(Guid streamId, long seq, DateTimeOffset reportedAt, DateTimeOffset receivedAt)
    {
        var robot = new FleetRobotIdentity("robot_test_01", "PHYSICAL", "Test robot", false);
        var report = new FleetTelemetryReport("robot_test_01", streamId, seq, reportedAt, "test-map", "map",
            null, "IDLE", null, null, null, null, null);
        return new FleetTelemetrySnapshot(robot, report, receivedAt);
    }

    private sealed class MutableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset current = now;
        public override DateTimeOffset GetUtcNow() => current;
        public void Advance(TimeSpan duration) => current += duration;
    }

    private sealed class TestClientProxy(
        Func<string, object?[], CancellationToken, Task> send) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) =>
            send(method, args, cancellationToken);
    }

    private sealed class TestHubContext : IHubContext<FleetOperationsHub>
    {
        public TestHubContext(IClientProxy client)
        {
            Clients = new TestHubClients(client);
            Groups = new TestGroupManager();
        }

        public IHubClients Clients { get; }
        public IGroupManager Groups { get; }
    }

    private sealed class TestHubClients(IClientProxy client) : IHubClients
    {
        public IClientProxy All => client;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => client;
        public IClientProxy Client(string connectionId) => client;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => client;
        public IClientProxy Group(string groupName) => client;
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => client;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => client;
        public IClientProxy User(string userId) => client;
        public IClientProxy Users(IReadOnlyList<string> userIds) => client;
    }

    private sealed class TestGroupManager : IGroupManager
    {
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}

public class AcceptThenCancelSender : DispatchProxy
{
    private InMemoryFleetTelemetryStore store = null!;
    private CancellationTokenSource requestAborted = null!;
    private DateTimeOffset now;

    public void Initialize(InMemoryFleetTelemetryStore telemetryStore, CancellationTokenSource cancellation, DateTimeOffset receivedAt)
    {
        store = telemetryStore;
        requestAborted = cancellation;
        now = receivedAt;
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        if (targetMethod?.Name != nameof(ISender.Send) || args is not [SyncFleetTelemetry request, CancellationToken cancellationToken])
            throw new NotSupportedException($"Unexpected sender call: {targetMethod?.Name}.");

        return HandleAsync(request, cancellationToken);
    }

    private async Task<SyncFleetTelemetryResult> HandleAsync(SyncFleetTelemetry request, CancellationToken cancellationToken)
    {
        var snapshot = new FleetTelemetrySnapshot(request.Robot, request.Report, now);
        var result = await store.ApplyAsync(snapshot, cancellationToken);
        requestAborted.Cancel();
        return new SyncFleetTelemetryResult(!result.Applied, now, result.Current);
    }
}
