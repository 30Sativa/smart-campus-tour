using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.RegistrationReview.Commands.ReviewRegistration;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

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
    public Task<ActionResult<BaseResponse<object?>>> Approve(Guid id, [FromBody] ReviewRequest request, CancellationToken ct) =>
        Review(id, true, request, ct);

    [HttpPost("{id:guid}/reject")]
    public Task<ActionResult<BaseResponse<object?>>> Reject(Guid id, [FromBody] ReviewRequest request, CancellationToken ct) =>
        Review(id, false, request, ct);

    private async Task<ActionResult<BaseResponse<object?>>> Review(Guid id, bool approve, ReviewRequest request, CancellationToken ct)
    {
        await sender.Send(new ReviewRegistrationCommand(id, User.GetRequiredUserId(), approve, request), ct);
        return Ok(new BaseResponse<object?> { Success = true, Message = "OK", Data = null });
    }
}
