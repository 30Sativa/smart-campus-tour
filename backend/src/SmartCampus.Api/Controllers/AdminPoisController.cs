using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Pois.Commands.CreatePoi;
using SmartCampus.Application.Features.Pois.Commands.SetPoiAvailability;
using SmartCampus.Application.Features.Pois.Commands.UpdatePoi;
using SmartCampus.Application.Features.Pois.Dtos;
using SmartCampus.Application.Features.Pois.Queries.GetPoiDetails;
using SmartCampus.Application.Features.Pois.Queries.GetPois;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Admin)]
[Route("api/admin/pois")]
public sealed class AdminPoisController(ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResponse<PoiListItemResponse>>> List(
        [FromQuery] CollectionQueryParameters parameters,
        [FromQuery] bool? isActive,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(parameters.Expand))
        {
            throw new ValidationException(
            [
                new ValidationFailure(nameof(parameters.Expand), "POI expansion is not supported.")
            ]);
        }

        var page = await sender.Send(new GetPoisQuery(new GetPoisRequest(
            parameters.Search, parameters.Sort, parameters.Page, parameters.Size, isActive)), cancellationToken);
        return Ok(new PagedResponse<PoiListItemResponse>
        {
            Success = true,
            Message = "POIs retrieved.",
            Data = page.Items,
            Pagination = new PaginationMetadata(page.Page, page.PageSize, page.TotalItems, page.TotalPages)
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<BaseResponse<PoiDetailsResponse>>> Get(
        Guid id,
        CancellationToken cancellationToken)
    {
        var poi = await sender.Send(new GetPoiDetailsQuery(id), cancellationToken);
        return Ok(new BaseResponse<PoiDetailsResponse>
        {
            Success = true,
            Message = "POI retrieved.",
            Data = poi
        });
    }

    [HttpPost]
    public async Task<ActionResult<BaseResponse<CreatePoiResponse>>> Create(
        [FromBody] CreatePoiRequest request,
        CancellationToken cancellationToken)
    {
        var result = await sender.Send(new CreatePoiCommand(User.GetRequiredUserId(), request), cancellationToken);
        return Ok(new BaseResponse<CreatePoiResponse>
        {
            Success = true,
            Message = "POI created inactive.",
            Data = result
        });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdatePoiRequest request,
        CancellationToken cancellationToken)
    {
        await sender.Send(new UpdatePoiCommand(id, User.GetRequiredUserId(), request), cancellationToken);
        return Ok(new BaseResponse<object?> { Success = true, Message = "POI updated.", Data = null });
    }

    [HttpPost("{id:guid}/activate")]
    public Task<IActionResult> Activate(
        Guid id,
        [FromBody] ChangePoiAvailabilityRequest request,
        CancellationToken cancellationToken) => SetAvailability(id, request, true, cancellationToken);

    [HttpPost("{id:guid}/deactivate")]
    public Task<IActionResult> Deactivate(
        Guid id,
        [FromBody] ChangePoiAvailabilityRequest request,
        CancellationToken cancellationToken) => SetAvailability(id, request, false, cancellationToken);

    private async Task<IActionResult> SetAvailability(
        Guid id,
        ChangePoiAvailabilityRequest request,
        bool isActive,
        CancellationToken cancellationToken)
    {
        await sender.Send(new SetPoiAvailabilityCommand(
            id, User.GetRequiredUserId(), request.ExpectedRowVersion, isActive), cancellationToken);
        return Ok(new BaseResponse<object?>
        {
            Success = true,
            Message = isActive ? "POI activated." : "POI deactivated.",
            Data = null
        });
    }
}
