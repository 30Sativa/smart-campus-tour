using SmartCampus.Application.Features.Representative.Queries.Tours;
using SmartCampus.Application.Features.Representative.Queries.Lists;
using SmartCampus.Application.Features.Representative.Commands.RegistrationDraft;
using SmartCampus.Application.Features.Registrations;
using MediatR;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Representative.Commands.SubmitRegistration;
using SmartCampus.Application.Features.Representative.Commands.SubmitRegistration.Dtos;
using SmartCampus.Application.Features.Representative.Commands.UpdateRegistration;
using SmartCampus.Application.Features.Representative.Commands.ResubmitRegistration;
using SmartCampus.Application.Features.Representative.Commands.CancelRegistration;
using SmartCampus.Application.Features.Representative.Commands.CancelRegistration.Dtos;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTour;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations.Dtos;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;
using SmartCampus.Application.Features.RosterEmailCorrection.Commands;
using SmartCampus.Application.Features.RosterEmailCorrection.Queries;
using SmartCampus.Application.Features.RosterEmailCorrection;

namespace SmartCampus.Api.Controllers;

[ApiController]
[RequestSizeLimit(4 * 1024 * 1024)]
[Authorize(Roles = ApplicationRoles.Representative)]
[Route("api/representative")]
public sealed class RepresentativeController(ISender sender) : ControllerBase
{
    [HttpGet("tours")]
    public async Task<ActionResult<PagedResponse<TourResponse>>> Tours([FromQuery] CollectionQueryParameters p, CancellationToken ct) =>
        Ok(Page(await sender.Send(new GetRepresentativeToursQuery(User.GetRequiredUserId(), ListRequest(p)), ct)));
    [HttpGet("tours/{id:guid}")]
    public async Task<ActionResult<BaseResponse<TourResponse>>> Tour(Guid id, CancellationToken ct) =>
        Ok(Success(await sender.Send(new GetRepresentativeTourQuery(id, User.GetRequiredUserId()), ct)));
    [HttpGet("registrations")]
    public async Task<ActionResult<PagedResponse<RegistrationListItem>>> Registrations([FromQuery] CollectionQueryParameters p,
        [FromQuery] Guid? tourId, [FromQuery] string? state, [FromQuery] string? group, CancellationToken ct) =>
        Ok(Page(await sender.Send(new GetRepresentativeRegistrationsQuery(User.GetRequiredUserId(), ListRequest(p, tourId, state, group)), ct)));
    [HttpGet("registrations/{id:guid}")]
    public async Task<ActionResult<BaseResponse<RegistrationDetails>>> Registration(Guid id, CancellationToken ct) =>
        Ok(Success(await sender.Send(new GetRepresentativeRegistrationQuery(id, User.GetRequiredUserId()), ct)));
    [HttpPost("tours/{id:guid}/registrations")]
    public async Task<ActionResult<BaseResponse<RegistrationCreated>>> Submit(Guid id, [FromBody] RegistrationInput input,
        [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        if (!Guid.TryParse(key, out var requestId) || requestId == Guid.Empty)
            throw new ValidationException([new ValidationFailure("Idempotency-Key", "A non-empty UUID is required.")]);
        return Ok(Success(await sender.Send(new SubmitRegistrationCommand(id, User.GetRequiredUserId(), requestId, input), ct)));
    }
    [HttpPut("registrations/{id:guid}")]
    public async Task<ActionResult<BaseResponse<object?>>> Update(Guid id, [FromBody] ReplaceRegistrationRequest request, CancellationToken ct)
    {
        await sender.Send(new UpdateRegistrationCommand(id, User.GetRequiredUserId(), request), ct);
        return Ok(Success<object?>(null));
    }
    [HttpPost("registrations/{id:guid}/resubmit")]
    public async Task<ActionResult<BaseResponse<object?>>> Resubmit(Guid id, [FromBody] ReplaceRegistrationRequest request, CancellationToken ct)
    {
        await sender.Send(new ResubmitRegistrationCommand(id, User.GetRequiredUserId(), request), ct);
        return Ok(Success<object?>(null));
    }
    [HttpPost("registrations/{id:guid}/cancel")]
    public async Task<ActionResult<BaseResponse<object?>>> Cancel(Guid id, [FromBody] CancelRegistrationRequest request, CancellationToken ct)
    {
        await sender.Send(new CancelRegistrationCommand(id, User.GetRequiredUserId(), request), ct);
        return Ok(Success<object?>(null));
    }
    [HttpPost("registrations/{id:guid}/rows/{rowId:guid}/email-change-requests")]
    public async Task<ActionResult<BaseResponse<Guid>>> RequestEmailChange(Guid id, Guid rowId,
        [FromBody] RequestRosterEmailChangeRequest request, CancellationToken ct) =>
        Ok(Success(await sender.Send(new RequestRosterEmailChangeCommand(id, rowId, User.GetRequiredUserId(), request), ct)));

    [HttpGet("registrations/{id:guid}/email-change-requests")]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<RosterEmailChangeView>>>> EmailChangeRequests(Guid id,
        [FromQuery] string? state, CancellationToken ct) =>
        Ok(Success(await sender.Send(new ListRosterEmailChangesQuery(id, User.GetRequiredUserId(), state), ct)));
    private static RepresentativeListRequest ListRequest(CollectionQueryParameters p, Guid? tour = null, string? state = null, string? group = null) =>
        new(p.Search, p.Sort, p.Page, p.Size, p.Expand, tour, state, group);
    private static BaseResponse<T> Success<T>(T? data) => new() { Success = true, Message = "OK", Data = data };
    private static PagedResponse<T> Page<T>(PagedResult<T> page) => new()
    {
        Success = true, Message = "OK", Data = page.Items,
        Pagination = new(page.Page, page.PageSize, page.TotalItems, page.TotalPages)
    };
}
