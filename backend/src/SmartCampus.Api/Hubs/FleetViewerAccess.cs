using Microsoft.AspNetCore.SignalR;

namespace SmartCampus.Api.Hubs;

/// <summary>
/// Who may receive robot positions (plan "Ai được xem vị trí"):
/// Admin and Staff see every robot; a Student sees only the robot of the
/// RUNNING Tour they joined. Nothing is sent to anyone else.
///
/// The backend has no sign-in or Student browser session yet, so today:
/// - roles come from the authenticated principal (claims "Admin"/"Staff")
///   once authentication is added; without it no one qualifies;
/// - in Development only, <c>RobotTelemetry:AllowAnonymousViewers=true</c>
///   lets any browser watch, for local testing with the web mocks.
/// When the Student join/session backend lands, <see cref="CanWatchTour"/> must
/// check that session's Tour and access version instead of the flag.
/// </summary>
public sealed class FleetViewerAccess(IConfiguration configuration, IHostEnvironment environment)
{
    private readonly bool anonymous = environment.IsDevelopment() &&
        configuration.GetValue<bool>("RobotTelemetry:AllowAnonymousViewers");

    public bool IsOperator(HubCallerContext context) =>
        anonymous || context.User?.IsInRole("Admin") == true || context.User?.IsInRole("Staff") == true;

    public bool CanWatchTour(HubCallerContext context, Guid tourId) => IsOperator(context) || anonymous;
}
