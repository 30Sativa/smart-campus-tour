using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.RateLimiting;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Api.Hubs;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetCamera;
using SmartCampus.Application.Features.FleetCamera.Commands.PollCameraDemand;

namespace SmartCampus.Api.Controllers;

/// <summary>ADR-0052: the robot's Quest stream service asks whether anyone needs its camera now.</summary>
[ApiController]
[Route("api/fleet/camera/v1")]
[Authorize(AuthenticationSchemes = FleetRobotAuthentication.Scheme)]
public sealed class FleetCameraController(ISender sender) : ControllerBase
{
    /// <summary>
    /// Optional body <c>{headset: {connection, batteryPercent, charging, stream}}</c> (ADR-0056); an older quest-stream
    /// sends none. Polled every few seconds, so it shares the Fleet Sync per-IP budget.
    /// </summary>
    [HttpPost("poll")]
    [RequestSizeLimit(1024)]
    [EnableRateLimiting("FleetSync")]
    public async Task<ActionResult<BaseResponse<CameraDemand>>> Poll(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] FleetCameraPollRequest? request, CancellationToken ct)
    {
        var headset = request?.Headset is { } h
            ? HeadsetReports.Normalise(h.Connection, h.BatteryPercent, h.Charging, h.Stream)
            : null;
        return Ok(new BaseResponse<CameraDemand>
        {
            Success = true,
            Message = "Camera demand.",
            Data = await sender.Send(new PollCameraDemand(RobotCode(), headset), ct)
        });
    }

    private string RobotCode() =>
        HttpContext.Items.TryGetValue(FleetRobotAuthentication.RequestProofItemKey, out var value) && value is FleetRobotAuthenticationProof proof
            ? proof.Identity.RobotCode
            : throw new InvalidOperationException("Authenticated Fleet Robot proof was unavailable for this request.");
}

public sealed record FleetCameraPollRequest(FleetHeadsetReport? Headset);

/// <summary>The headset as quest-stream read it; every field is optional and normalised by the backend.</summary>
public sealed record FleetHeadsetReport(string? Connection, int? BatteryPercent, bool? Charging, string? Stream);
