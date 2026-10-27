using MediatR;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Routes.Commands.CreateRoute;
using SmartCampus.Application.Features.Routes.Commands.DeleteRoute;
using SmartCampus.Application.Features.Routes.Commands.SetRouteAvailability;
using SmartCampus.Application.Features.Routes.Commands.UpdateRoute;
using SmartCampus.Application.Features.Routes.Queries.GetRoute;
using SmartCampus.Application.Features.Routes.Queries.GetRoutes;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Staff)]
[Route("api/staff/manage/routes")]
[Route("api/admin/routes")]
public sealed class StaffRoutesController(ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] CollectionQueryParameters parameters, [FromQuery] bool? isActive,
        CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(parameters.Expand))
            throw new ValidationException([new ValidationFailure("Expand", "Route expansion is not supported.")]);
        var result = await sender.Send(new GetRoutesQuery(parameters.Search, isActive, parameters.Page, parameters.Size,
            string.IsNullOrWhiteSpace(parameters.Sort) ? "name" : parameters.Sort.Trim()), ct);
        return Ok(new PagedResponse<RouteListItem>
        {
            Success = true, Message = "Routes retrieved.", Data = result.Items,
            Pagination = new PaginationMetadata(result.Page, result.PageSize, result.TotalItems, result.TotalPages)
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<RouteDetails> { Success = true, Message = "Route retrieved.", Data = await sender.Send(new GetRouteQuery(id), ct) });

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] RouteInput input, CancellationToken ct) =>
        Ok(new BaseResponse<CreateRouteResult> { Success = true, Message = "Route created inactive.",
            Data = await sender.Send(new CreateRouteCommand(User.GetRequiredUserId(), input), ct) });

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateRouteInput input, CancellationToken ct)
    {
        await sender.Send(new UpdateRouteCommand(id, User.GetRequiredUserId(), input), ct);
        return Success("Route updated.");
    }

    [HttpPost("{id:guid}/activate")]
    public Task<IActionResult> Activate(Guid id, [FromBody] RouteVersionRequest input, CancellationToken ct) => SetActive(id, input, true, ct);

    [HttpPost("{id:guid}/deactivate")]
    public Task<IActionResult> Deactivate(Guid id, [FromBody] RouteVersionRequest input, CancellationToken ct) => SetActive(id, input, false, ct);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromBody] RouteVersionRequest input, CancellationToken ct)
    {
        await sender.Send(new DeleteRouteCommand(id, User.GetRequiredUserId(), input.ExpectedVersion), ct);
        return Success("Route deleted.");
    }

    private async Task<IActionResult> SetActive(Guid id, RouteVersionRequest input, bool active, CancellationToken ct)
    {
        await sender.Send(new SetRouteAvailabilityCommand(id, User.GetRequiredUserId(), input.ExpectedVersion, active), ct);
        return Success(active ? "Route activated." : "Route deactivated.");
    }

    private OkObjectResult Success(string message) => Ok(new BaseResponse<object?> { Success = true, Message = message });
}

public sealed record RouteVersionRequest(string ExpectedVersion);
