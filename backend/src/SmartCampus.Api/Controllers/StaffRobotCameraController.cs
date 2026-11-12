using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.FleetCamera;
using SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;
using SmartCampus.Application.Features.FleetCamera.Queries.GetRobotHeadset;

namespace SmartCampus.Api.Controllers;

/// <summary>
/// ADR-0052: a Staff page that shows a robot's camera keeps it on by renewing a short lease. ADR-0055: the answer also
/// carries the relay token for that Staff user.
/// </summary>
[ApiController]
[Authorize(Roles = ApplicationRoles.Staff)]
[Route("api/staff/manage/robots")]
public sealed class StaffRobotCameraController(ISender sender) : ControllerBase
{
    [HttpPost("{robotCode}/camera-lease")]
    public async Task<ActionResult<BaseResponse<RobotCameraStatus>>> Lease(string robotCode, CancellationToken ct)
    {
        var status = await sender.Send(new LeaseCamera(robotCode, User.GetRequiredUserId()), ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<RobotCameraStatus> { Success = true, Message = "Camera lease renewed.", Data = status });
    }

    /// <summary>ADR-0056: the headset battery and connection the robot reported with its last camera poll.</summary>
    [HttpGet("{robotCode}/headset")]
    public async Task<ActionResult<BaseResponse<RobotHeadsetStatus>>> Headset(string robotCode, CancellationToken ct)
    {
        var status = await sender.Send(new GetRobotHeadset(robotCode), ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<RobotHeadsetStatus> { Success = true, Message = "Headset status.", Data = status });
    }
}
