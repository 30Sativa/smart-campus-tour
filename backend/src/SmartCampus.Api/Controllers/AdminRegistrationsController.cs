using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.RegistrationReview.Commands;
using SmartCampus.Application.Features.RegistrationReview.Commands.ApproveRegistration;
using SmartCampus.Application.Features.RegistrationReview.Commands.RejectRegistration;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations.Dtos;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Admin)]
[Route("api/admin/registrations")]
public sealed class AdminRegistrationsController(ISender sender) : ControllerBase
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

    [HttpPost("{id:guid}/approve")]
    public async Task<ActionResult<BaseResponse<object?>>> Approve(Guid id, [FromBody] ReviewRequest request, CancellationToken ct)
    {
        await sender.Send(new ApproveRegistrationCommand(id, User.GetRequiredUserId(), request), ct);
        return Ok(Committed());
    }

    [HttpPost("{id:guid}/reject")]
    public async Task<ActionResult<BaseResponse<object?>>> Reject(Guid id, [FromBody] ReviewRequest request, CancellationToken ct)
    {
        await sender.Send(new RejectRegistrationCommand(id, User.GetRequiredUserId(), request), ct);
        return Ok(Committed());
    }

    // Decisions return no data: clients refetch the committed detail.
    private static BaseResponse<object?> Committed() => new() { Success = true, Message = "OK", Data = null };
}
