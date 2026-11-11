using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
    /// <summary>No body. Polled every few seconds, so it shares the Fleet Sync per-IP budget.</summary>
    [HttpPost("poll")]
    [RequestSizeLimit(1024)]
    [EnableRateLimiting("FleetSync")]
    public async Task<ActionResult<BaseResponse<CameraDemand>>> Poll(CancellationToken ct) =>
        Ok(new BaseResponse<CameraDemand>
        {
            Success = true,
            Message = "Camera demand.",
            Data = await sender.Send(new PollCameraDemand(RobotCode()), ct)
        });

    private string RobotCode() =>
        HttpContext.Items.TryGetValue(FleetRobotAuthentication.RequestProofItemKey, out var value) && value is FleetRobotAuthenticationProof proof
            ? proof.Identity.RobotCode
            : throw new InvalidOperationException("Authenticated Fleet Robot proof was unavailable for this request.");
}
