using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.TourEngagement;
using SmartCampus.Application.Features.TourEngagement.Queries;

namespace SmartCampus.Api.Controllers;

/// <summary>
/// ADR-0071 engagement report for Staff: how invited viewers joined, voted, asked and left, per Tour and per POI over a
/// period. Aggregates only: no response names a viewer or carries question text.
/// </summary>
[ApiController]
[Authorize(Roles = ApplicationRoles.Staff)]
public sealed class StaffEngagementController(ISender sender) : ControllerBase
{
    [HttpGet("api/staff/manage/tours/{id:guid}/engagement")]
    public async Task<ActionResult<BaseResponse<TourEngagementView>>> GetTour(Guid id, CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<TourEngagementView>
        {
            Success = true, Message = "OK", Data = await sender.Send(new GetTourEngagementQuery(id), ct)
        });
    }

    /// <summary>Ended Tours that started in [<paramref name="from"/>, <paramref name="to"/>); both are required.</summary>
    [HttpGet("api/staff/engagement")]
    public async Task<ActionResult<BaseResponse<EngagementOverviewView>>> GetOverview([FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to, CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(new BaseResponse<EngagementOverviewView>
        {
            Success = true, Message = "OK", Data = await sender.Send(new GetEngagementOverviewQuery(from, to), ct)
        });
    }
}
