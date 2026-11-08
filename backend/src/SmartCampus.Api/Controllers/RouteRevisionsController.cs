using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class RouteRevisionsController(ISender sender) : ControllerBase
{
    [HttpGet("routes")]
    [Authorize(Roles = ApplicationRoles.Staff + "," + ApplicationRoles.TechnicalStaff)]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] Guid? mapVersionId,
        [FromQuery] int page = 1, [FromQuery] int size = 20, [FromQuery] string sort = "name", [FromQuery] bool? isActive = null, CancellationToken ct = default)
    {
        var result = await sender.Send(new ListVersionedRoutesQuery(search, mapVersionId, page, size,
            string.IsNullOrWhiteSpace(sort) ? "name" : sort.Trim(), isActive), ct);
        return Ok(new PagedResponse<RouteRevisionView>
        {
            Success = true,
            Message = "Current versioned routes retrieved.",
            Data = result.Items,
            Pagination = new PaginationMetadata(result.Page, result.PageSize, result.TotalItems, result.TotalPages)
        });
    }

    [HttpPost("staff/routes")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<IActionResult> Create([FromBody] RouteRevisionDraftInput input, CancellationToken ct) =>
        Ok(new BaseResponse<RouteRevisionView> { Success = true, Message = "Route draft revision created.",
            Data = await sender.Send(new SaveRouteRevisionCommand(User.GetRequiredUserId(), null, input), ct) });

    [HttpPost("staff/routes/{routeId:guid}/revisions")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<IActionResult> Revise(Guid routeId, [FromBody] RouteRevisionDraftInput input, CancellationToken ct) =>
        Ok(new BaseResponse<RouteRevisionView> { Success = true, Message = "Route draft revision created.",
            Data = await sender.Send(new SaveRouteRevisionCommand(User.GetRequiredUserId(), routeId, input), ct) });

    [HttpPost("staff/routes/{routeId:guid}/revisions/{revisionId:guid}/submit")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<IActionResult> Submit(Guid routeId, Guid revisionId, [FromBody] RouteRevisionRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<RouteRevisionView> { Success = true, Message = "Route revision submitted for manual technical testing.",
            Data = await sender.Send(new SubmitRouteRevisionCommand(User.GetRequiredUserId(), routeId, revisionId, request), ct) });

    [HttpGet("staff/routes/{routeId:guid}/scheduled-tours")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<IActionResult> ScheduledTours(Guid routeId, CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<RouteScheduledTourView>> { Success = true, Message = "Scheduled Tours on this route retrieved.",
            Data = await sender.Send(new ListRouteScheduledToursQuery(routeId), ct) });

    [HttpPost("staff/routes/{routeId:guid}/deactivate")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<IActionResult> Deactivate(Guid routeId, [FromBody] RouteAvailabilityRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<RouteAvailabilityResult> { Success = true, Message = "Route deactivated for new Tours.",
            Data = await sender.Send(new SetVersionedRouteAvailabilityCommand(User.GetRequiredUserId(), routeId, false, request), ct) });

    [HttpPost("staff/routes/{routeId:guid}/activate")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<IActionResult> Activate(Guid routeId, [FromBody] RouteAvailabilityRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<RouteAvailabilityResult> { Success = true, Message = "Route activated for new Tours.",
            Data = await sender.Send(new SetVersionedRouteAvailabilityCommand(User.GetRequiredUserId(), routeId, true, request), ct) });

    [HttpGet("routes/{routeId:guid}/revisions")]
    [Authorize(Roles = ApplicationRoles.Staff + "," + ApplicationRoles.TechnicalStaff)]
    public async Task<IActionResult> History(Guid routeId, [FromQuery] Guid? revisionId, [FromQuery] bool includeHistory = true, CancellationToken ct = default) =>
        Ok(new BaseResponse<RouteRevisionView> { Success = true, Message = "Route revision retrieved.",
            Data = await sender.Send(new GetRouteRevisionQuery(routeId, revisionId, includeHistory), ct) });

    [HttpGet("technical/route-verifications/queue")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<IActionResult> Queue(CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<RouteRevisionView>> { Success = true, Message = "Submitted route revisions retrieved.",
            Data = await sender.Send(new ListRouteRevisionQueueQuery(), ct) });

    [HttpGet("technical/route-verifications/rerun-queue")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<IActionResult> RerunQueue(CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<RouteRevisionView>> { Success = true, Message = "Route revisions needing a new test run retrieved.",
            Data = await sender.Send(new ListRouteRerunQueueQuery(), ct) });

    [HttpGet("technical/route-verifications/participants")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<IActionResult> Participants(CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<RouteTestParticipantView>> { Success = true, Message = "Route test participants retrieved.",
            Data = await sender.Send(new ListRouteTestParticipantsQuery(), ct) });

    [HttpPost("technical/routes/{routeId:guid}/revisions/{revisionId:guid}/test-runs")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public async Task<IActionResult> RecordRun(Guid routeId, Guid revisionId, [FromBody] RouteRunRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<RouteRevisionView> { Success = true, Message = "Manual route test evidence recorded.",
            Data = await sender.Send(new RecordRouteTestRunCommand(User.GetRequiredUserId(), routeId, revisionId, request), ct) });
}
