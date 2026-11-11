using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.FleetCamera;
using SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;

namespace SmartCampus.Api.Controllers;

/// <summary>ADR-0052: a Staff page that shows a robot's camera keeps it on by renewing a short lease.</summary>
[ApiController]
[Authorize(Roles = ApplicationRoles.Staff)]
[Route("api/staff/manage/robots")]
public sealed class StaffRobotCameraController(ISender sender) : ControllerBase
{
    [HttpPost("{robotCode}/camera-lease")]
    public async Task<ActionResult<BaseResponse<RobotCameraStatus>>> Lease(string robotCode, CancellationToken ct) =>
        Ok(new BaseResponse<RobotCameraStatus>
        {
            Success = true,
            Message = "Camera lease renewed.",
            Data = await sender.Send(new LeaseCamera(robotCode), ct)
        });
}
