using Microsoft.AspNetCore.SignalR;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Simulation;

namespace SmartCampus.Api.Hubs;

public sealed record SimulationSnapshot(SimulationPose Pose, DateTimeOffset ReceivedAt);

public sealed class SimulationHub(SimulationBroadcaster broadcaster) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var latest = broadcaster.Latest;
        if (latest is not null)
            await Clients.Caller.SendAsync("PoseUpdated", latest, Context.ConnectionAborted);
        await base.OnConnectedAsync();
    }
}

public sealed class SimulationBroadcaster(IHubContext<SimulationHub> hub) : ISimulationPosePublisher
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private SimulationSnapshot? latest;
    public SimulationSnapshot? Latest => Volatile.Read(ref latest);

    public async Task PublishAsync(SimulationPose pose, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var previous = latest?.Pose;
            if (previous is not null &&
                (pose.CapturedAt < previous.CapturedAt ||
                 (pose.StreamId == previous.StreamId && pose.Seq <= previous.Seq) ||
                 (pose.StreamId != previous.StreamId && pose.CapturedAt <= previous.CapturedAt)))
                throw new ConflictException("Duplicate or out-of-order simulation pose.");

            var snapshot = new SimulationSnapshot(pose, DateTimeOffset.UtcNow);
            Volatile.Write(ref latest, snapshot);
            await hub.Clients.All.SendAsync("PoseUpdated", snapshot, cancellationToken);
        }
        finally { gate.Release(); }
    }
}
