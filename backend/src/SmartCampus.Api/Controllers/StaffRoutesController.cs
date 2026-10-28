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
using SmartCampus.Application.Features.Routes.Queries.GetRoute;
using SmartCampus.Application.Features.Routes.Queries.GetRoutes;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Staff)]
[Route("api/staff/manage/routes")]
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

}
