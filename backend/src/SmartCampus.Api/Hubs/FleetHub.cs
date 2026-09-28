using Microsoft.AspNetCore.SignalR;
using SmartCampus.Application.Features.RobotTelemetry;

namespace SmartCampus.Api.Hubs;

/// <summary>
/// Robot positions for browsers. Read-only: there is no method that moves a
/// robot, and a browser never talks to a robot directly.
///
/// - Admin/Staff are put in <see cref="Operators"/> on connect and receive
///   <c>RobotPoses</c> for every robot (latest state, at most 5 Hz).
/// - A Student calls <see cref="WatchTour"/> and receives <c>TourRobotPose</c>
///   for that Tour's robot only (at most 2 Hz), and <c>TourRobotEnded</c> when
///   the Tour stops RUNNING.
/// </summary>
public sealed class FleetHub(
    FleetViewerAccess access,
    IRobotTelemetryStore store,
    ITourRobotResolver resolver,
    TourWatchRegistry watches,
    TimeProvider clock) : Hub
{
    public const string Operators = "fleet:operators";
    public static string TourGroup(Guid tourId) => $"fleet:tour:{tourId}";
    private const string WatchedTourKey = "fleet:watchedTour";

    public override async Task OnConnectedAsync()
    {
        if (access.IsOperator(Context))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, Operators, Context.ConnectionAborted);
            await Clients.Caller.SendAsync(FleetMessages.RobotPoses, FleetMessages.Operators(store.All(), clock.GetUtcNow()), Context.ConnectionAborted);
        }
        await base.OnConnectedAsync();
    }

    /// <returns>false when the Tour is not RUNNING or has no robot; the page then shows no robot.</returns>
    public async Task<bool> WatchTour(Guid tourId)
    {
        if (!access.CanWatchTour(Context, tourId))
            throw new HubException("Không có quyền xem vị trí robot của buổi này.");

        var robotCode = await resolver.RunningRobotCodeAsync(tourId, Context.ConnectionAborted);
        if (robotCode is null) return false;

        if (Context.Items.TryGetValue(WatchedTourKey, out var previous) && previous is Guid old)
        {
            if (old == tourId) return true;
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, TourGroup(old));
            watches.Leave(old);
        }

        Context.Items[WatchedTourKey] = tourId;
        watches.Join(tourId, robotCode);
        await Groups.AddToGroupAsync(Context.ConnectionId, TourGroup(tourId), Context.ConnectionAborted);
        await Clients.Caller.SendAsync(FleetMessages.TourRobotPose, FleetMessages.Student(tourId, store.Get(robotCode), clock.GetUtcNow()), Context.ConnectionAborted);
        return true;
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue(WatchedTourKey, out var watched) && watched is Guid tourId)
            watches.Leave(tourId);
        return base.OnDisconnectedAsync(exception);
    }
}
