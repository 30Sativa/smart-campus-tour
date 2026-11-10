using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.StaffNotifications;

namespace SmartCampus.Api.Controllers;

/// <summary>Staff's bell: the newest Technical Staff outcomes on POIs, Routes, map versions and held robots.</summary>
[ApiController]
[Authorize(Roles = ApplicationRoles.Staff)]
[Route("api/staff/notifications")]
public sealed class StaffNotificationsController(ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<StaffNotification>>>> List([FromQuery] int size = 30, CancellationToken ct = default) =>
        Ok(new BaseResponse<IReadOnlyList<StaffNotification>> { Success = true, Message = "Staff notifications retrieved.",
            Data = await sender.Send(new ListStaffNotificationsQuery(size), ct) });
}
