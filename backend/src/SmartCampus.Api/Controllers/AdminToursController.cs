using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Commands.UpdateTour;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Application.Features.Tours.Queries.GetTours;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Admin)]
[Route("api/admin/tours")]
public sealed class AdminToursController(ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] CollectionQueryParameters parameters,
        [FromQuery] string? state, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(parameters.Expand))
            throw new ValidationException([new ValidationFailure("Expand", "Tour expansion is not supported.")]);
        var page = await sender.Send(new GetToursQuery(new(parameters.Search,
            string.IsNullOrWhiteSpace(parameters.Sort) ? "scheduledStartAt" : parameters.Sort.Trim(),
            parameters.Page, parameters.Size, state, from, to)), ct);
        return Ok(new PagedResponse<TourSummary> { Success = true, Message = "Tours retrieved.", Data = page.Items,
            Pagination = new PaginationMetadata(page.Page, page.PageSize, page.TotalItems, page.TotalPages) });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<TourDetails> { Success = true, Message = "Tour retrieved.", Data = await sender.Send(new GetTourQuery(id), ct) });

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTourRequest request, CancellationToken ct) =>
        Success(await sender.Send(new CreateTourCommand(User.GetRequiredUserId(), request), ct), "Tour created SCHEDULED.");

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTourRequest request, CancellationToken ct) =>
        Success(await sender.Send(new UpdateTourCommand(id, User.GetRequiredUserId(), request), ct), "Tour updated.");

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelTourRequest request, CancellationToken ct) =>
        Success(await sender.Send(new CancelTourCommand(id, User.GetRequiredUserId(), request), ct), "Tour cancelled before Start.");

    private OkObjectResult Success(TourMutationResult result, string message) =>
        Ok(new BaseResponse<TourMutationResult> { Success = true, Message = message, Data = result });
}
