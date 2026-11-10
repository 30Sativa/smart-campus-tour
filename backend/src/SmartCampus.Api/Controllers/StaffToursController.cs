using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Requests;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.FleetHead;
using SmartCampus.Application.Features.FleetHead.Commands.SendHeadCommand;
using SmartCampus.Application.Features.FleetHead.Commands.SetTourHeadMode;
using SmartCampus.Application.Features.FleetHead.Queries.GetTourHeadStatus;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Commands.EndTourEarly;
using SmartCampus.Application.Features.Tours.Commands.MarkTourReady;
using SmartCampus.Application.Features.Tours.Commands.NextTourStop;
using SmartCampus.Application.Features.Tours.Commands.ReconcileRobotCommand;
using SmartCampus.Application.Features.Tours.Commands.ReopenTour;
using SmartCampus.Application.Features.Tours.Commands.RetryTourLeg;
using SmartCampus.Application.Features.Tours.Commands.StartTour;
using SmartCampus.Application.Features.Tours.Commands.UpdateTour;
using SmartCampus.Application.Features.Tours.Commands.ChangeTourCapacity;
using SmartCampus.Application.Features.Tours.Commands.ChangeTourOperator;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Application.Features.Tours.Queries.GetTourShifts;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;
using SmartCampus.Application.Features.Tours.Queries.GetTourStartChecks;
using SmartCampus.Application.Features.Tours.Queries.ListTourRobots;
using SmartCampus.Application.Features.Tours.Queries.GetTours;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Authorize(Roles = ApplicationRoles.Staff)]
[Route("api/staff/manage/tours")]
public sealed class StaffToursController(ISender sender) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] CollectionQueryParameters parameters,
        [FromQuery] string? state, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] string? phase,
        [FromQuery(Name = "operator")] string? operatorFilter, [FromQuery] bool needsReconcile, [FromQuery] bool readyBlockers, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(parameters.Expand))
            throw new ValidationException([new ValidationFailure("Expand", "Tour expansion is not supported.")]);
        // Only the caller's own Tours: `operator=me`. Another account's id is not a filter this list offers.
        if (operatorFilter is not null && operatorFilter != "me")
            throw new ValidationException([new ValidationFailure("Operator", "operator chỉ nhận giá trị 'me'.")]);
        var page = await sender.Send(new GetToursQuery(new(parameters.Search,
            string.IsNullOrWhiteSpace(parameters.Sort) ? "scheduledStartAt" : parameters.Sort.Trim(),
            parameters.Page, parameters.Size, state, from, to, phase,
            OperatorUserId: operatorFilter is null ? null : User.GetRequiredUserId(),
            NeedsReconcile: needsReconcile, IncludeReadyBlockers: readyBlockers)), ct);
        return Ok(new PagedResponse<TourSummary> { Success = true, Message = "Tours retrieved.", Data = page.Items,
            Pagination = new PaginationMetadata(page.Page, page.PageSize, page.TotalItems, page.TotalPages) });
    }

    [HttpGet("operators")]
    public async Task<IActionResult> Operators(CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<RouteTestParticipantView>> { Success = true, Message = "Tour operators retrieved.",
            Data = await sender.Send(new ListRouteTestParticipantsQuery(), ct) });

    [HttpGet("robots")]
    public async Task<IActionResult> Robots([FromQuery] Guid routeRevisionId, CancellationToken ct) =>
        Ok(new BaseResponse<IReadOnlyList<TourRobotOption>> { Success = true, Message = "Tour robots retrieved.",
            Data = await sender.Send(new ListTourRobotsQuery(routeRevisionId), ct) });

    [HttpGet("slots")]
    public async Task<IActionResult> Slots([FromQuery] Guid routeRevisionId, [FromQuery] string robotCode,
        [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct) =>
        Ok(new BaseResponse<TourSlotsView> { Success = true, Message = "Tour slots retrieved.",
            Data = await sender.Send(new GetTourSlotsQuery(routeRevisionId, robotCode, from, to), ct) });

    [HttpGet("shifts")]
    public async Task<IActionResult> Shifts([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken ct) =>
        Ok(new BaseResponse<TourShiftsView> { Success = true, Message = "Tour shifts retrieved.",
            Data = await sender.Send(new GetTourShiftsQuery(from, to), ct) });

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<TourDetails> { Success = true, Message = "Tour retrieved.", Data = await sender.Send(new GetTourQuery(id, User.GetRequiredUserId()), ct) });

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTourRequest request, CancellationToken ct) =>
        Success(await sender.Send(new CreateTourCommand(User.GetRequiredUserId(), request), ct), "Tour created SCHEDULED.");

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTourRequest request, CancellationToken ct) =>
        Success(await sender.Send(new UpdateTourCommand(id, User.GetRequiredUserId(), request), ct), "Tour updated.");

    [HttpPost("{id:guid}/capacity")]
    public async Task<IActionResult> ChangeCapacity(Guid id, [FromBody] ChangeTourCapacityRequest request, CancellationToken ct) =>
        Success(await sender.Send(new ChangeTourCapacityCommand(id, User.GetRequiredUserId(), request), ct), "Tour capacity changed.");

    [HttpPost("{id:guid}/operator")]
    public async Task<IActionResult> ChangeOperator(Guid id, [FromBody] ChangeTourOperatorRequest request, CancellationToken ct) =>
        Success(await sender.Send(new ChangeTourOperatorCommand(id, User.GetRequiredUserId(), request), ct), "Tour operator changed.");

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelTourRequest request, CancellationToken ct) =>
        Success(await sender.Send(new CancelTourCommand(id, User.GetRequiredUserId(), request), ct), "Tour cancelled before Start.");

    [HttpPost("{id:guid}/ready")]
    public async Task<IActionResult> MarkReady(Guid id, [FromBody] MarkTourReadyRequest request, CancellationToken ct) =>
        Success(await sender.Send(new MarkTourReadyCommand(id, User.GetRequiredUserId(), request), ct), "Tour marked READY.");

    [HttpPost("{id:guid}/reopen")]
    public async Task<IActionResult> Reopen(Guid id, [FromBody] ReopenTourRequest request, CancellationToken ct) =>
        Success(await sender.Send(new ReopenTourCommand(id, User.GetRequiredUserId(), request), ct), "Tour reopened to SCHEDULED.");

    [HttpGet("{id:guid}/start-checks")]
    public async Task<IActionResult> StartChecks(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<TourStartChecks> { Success = true, Message = "Tour start checks retrieved.",
            Data = await sender.Send(new GetTourStartChecksQuery(id, User.GetRequiredUserId()), ct) });

    [HttpPost("{id:guid}/start")]
    public async Task<IActionResult> Start(Guid id, [FromBody] StartTourRequest request, CancellationToken ct) =>
        Success(await sender.Send(new StartTourCommand(id, User.GetRequiredUserId(), request), ct), "Tour started.");

    [HttpPost("{id:guid}/next")]
    public async Task<IActionResult> Next(Guid id, [FromBody] NextTourStopRequest request, CancellationToken ct) =>
        Success(await sender.Send(new NextTourStopCommand(id, User.GetRequiredUserId(), request), ct), "Tour moved on.");

    [HttpPost("{id:guid}/end-early")]
    public async Task<IActionResult> EndEarly(Guid id, [FromBody] EndTourEarlyRequest request, CancellationToken ct) =>
        Success(await sender.Send(new EndTourEarlyCommand(id, User.GetRequiredUserId(), request), ct), "Tour ended early.");

    [HttpPost("{id:guid}/retry-leg")]
    public async Task<IActionResult> RetryLeg(Guid id, [FromBody] RetryTourLegRequest request, CancellationToken ct) =>
        Success(await sender.Send(new RetryTourLegCommand(id, User.GetRequiredUserId(), request), ct), "Leg retried.");

    [HttpPost("{id:guid}/commands/{commandId:guid}/reconcile")]
    public async Task<IActionResult> Reconcile(Guid id, Guid commandId, [FromBody] ReconcileRobotCommandRequest request, CancellationToken ct) =>
        Success(await sender.Send(new ReconcileRobotCommandCommand(id, commandId, User.GetRequiredUserId(), request), ct), "Command reconciled.");

    /// <summary>ADR-0045: the Operator of a RUNNING Tour turns its robot's head. Queued is not executed.</summary>
    [HttpPost("{id:guid}/head-commands")]
    [RequestSizeLimit(4 * 1024)]
    [EnableRateLimiting(FleetHeadRateLimit.Policy)]
    public async Task<ActionResult<BaseResponse<SendHeadCommandResult>>> QueueHeadCommand(Guid id,
        [FromBody] StaffHeadCommandRequest request, CancellationToken ct) =>
        Ok(new BaseResponse<SendHeadCommandResult>
        {
            Success = true,
            Message = "Head command queued.",
            Data = await sender.Send(new SendHeadCommand(id, User.GetRequiredUserId(), new HeadCommandSpec(request.Kind,
                request.PanSteps, request.TiltSteps, request.PanDir, request.TiltDir, request.PanDeg, request.TiltDeg)), ct)
        });

    /// <summary>ADR-0045 addendum: AUTO sweeps the head at every POI arrival, MANUAL only follows the buttons.</summary>
    [HttpPut("{id:guid}/head-mode")]
    [RequestSizeLimit(1024)]
    public async Task<ActionResult<BaseResponse<TourHeadModeResult>>> SetHeadMode(Guid id, [FromBody] StaffHeadModeRequest request,
        CancellationToken ct) =>
        Ok(new BaseResponse<TourHeadModeResult>
        {
            Success = true, Message = "Head mode set.",
            Data = await sender.Send(new SetTourHeadMode(id, User.GetRequiredUserId(), request.Mode), ct)
        });

    [HttpGet("{id:guid}/head")]
    public async Task<ActionResult<BaseResponse<TourHeadStatus>>> GetHeadStatus(Guid id, CancellationToken ct) =>
        Ok(new BaseResponse<TourHeadStatus>
        {
            Success = true, Message = "Head status retrieved.", Data = await sender.Send(new GetTourHeadStatusQuery(id), ct)
        });

    private OkObjectResult Success(TourMutationResult result, string message) =>
        Ok(new BaseResponse<TourMutationResult> { Success = true, Message = message, Data = result });
}
