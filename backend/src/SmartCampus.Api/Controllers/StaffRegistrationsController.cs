using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.RegistrationReview.Commands;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations.Dtos;
using SmartCampus.Application.Features.RosterEmailCorrection.Commands;
using SmartCampus.Application.Features.RosterEmailCorrection.Queries;
using SmartCampus.Application.Features.RosterEmailCorrection;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Staff)]
[Route("api/staff/manage/registrations")]
public sealed class StaffRegistrationsController(ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResponse<ReviewListItem>>> List([FromQuery] CollectionQueryParameters p,
        [FromQuery] Guid? tourId, [FromQuery] string? state, [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to, CancellationToken ct)
    {
        var page = await sender.Send(new ListRegistrationsQuery(new(p.Search, p.Sort, p.Page, p.Size, p.Expand, tourId, state, from, to)), ct);
        return Ok(new PagedResponse<ReviewListItem>
        {
            Success = true, Message = "OK", Data = page.Items,
            Pagination = new(page.Page, page.PageSize, page.TotalItems, page.TotalPages)
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<BaseResponse<ReviewDetails>>> Get(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<ReviewDetails> { Success = true, Message = "OK", Data = await sender.Send(new GetRegistrationQuery(id), ct) });

    [HttpPost("{id:guid}/rows/{rowId:guid}/accept")]
    public async Task<ActionResult<BaseResponse<object?>>> AcceptRow(Guid id, Guid rowId,
        [FromBody] ReviewRosterRowRequest request, CancellationToken ct)
    {
        await sender.Send(new ReviewRosterRowCommand(id, rowId, User.GetRequiredUserId(), "accept", request), ct);
        return Ok(Committed());
    }

    [HttpPost("{id:guid}/rows/{rowId:guid}/reject")]
    public async Task<ActionResult<BaseResponse<object?>>> RejectRow(Guid id, Guid rowId,
        [FromBody] ReviewRosterRowRequest request, CancellationToken ct)
    {
        await sender.Send(new ReviewRosterRowCommand(id, rowId, User.GetRequiredUserId(), "reject", request), ct);
        return Ok(Committed());
    }

    [HttpGet("~/api/staff/manage/roster-email-change-requests")]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<RosterEmailChangeView>>>> EmailChangeRequests(
        [FromQuery] string? state, CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<RosterEmailChangeView>> { Success = true, Message = "OK",
            Data = await sender.Send(new ListRosterEmailChangesQuery(null, null, state), ct) });

    [HttpGet("~/api/staff/manage/roster-email-change-requests/{requestId:guid}")]
    public async Task<ActionResult<BaseResponse<RosterEmailChangeView>>> EmailChangeRequest(Guid requestId, CancellationToken ct)
    {
        var rows = await sender.Send(new ListRosterEmailChangesQuery(null, null, null), ct);
        var item = rows.SingleOrDefault(row => row.Id == requestId);
        if (item is null) return NotFound();
        return Ok(new BaseResponse<RosterEmailChangeView> { Success = true, Message = "OK", Data = item });
    }

    [HttpPost("~/api/staff/manage/roster-email-change-requests/{requestId:guid}/accept")]
    public async Task<ActionResult<BaseResponse<object?>>> AcceptEmailChange(Guid requestId,
        [FromBody] ReviewRosterEmailChangeRequest request, CancellationToken ct)
    {
        await sender.Send(new ReviewRosterEmailChangeCommand(requestId, User.GetRequiredUserId(), "accept", request), ct);
        return Ok(Committed());
    }

    [HttpPost("~/api/staff/manage/roster-email-change-requests/{requestId:guid}/reject")]
    public async Task<ActionResult<BaseResponse<object?>>> RejectEmailChange(Guid requestId,
        [FromBody] ReviewRosterEmailChangeRequest request, CancellationToken ct)
    {
        await sender.Send(new ReviewRosterEmailChangeCommand(requestId, User.GetRequiredUserId(), "reject", request), ct);
        return Ok(Committed());
    }

    // Writes return no data: clients refetch the committed detail.
    private static BaseResponse<object?> Committed() => new() { Success = true, Message = "OK", Data = null };
}
