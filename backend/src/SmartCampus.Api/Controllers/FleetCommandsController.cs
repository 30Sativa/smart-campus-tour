using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Api.Hubs;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.Tours.Commands.PollRobotCommand;
using SmartCampus.Application.Features.Tours.Commands.ReportCommandResult;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Api.Controllers;

/// <summary>docs/contracts/fleet-commands/v1. Same robot scheme and rate-limit policy as Fleet Sync, whose wire stays telemetry-only.</summary>
[ApiController]
[Route("api/fleet/commands/v1")]
[Authorize(AuthenticationSchemes = FleetRobotAuthentication.Scheme)]
public sealed class FleetCommandsController(ISender sender) : ControllerBase
{
    [HttpPost("poll")]
    [RequestSizeLimit(4 * 1024)]
    [EnableRateLimiting("FleetSync")]
    public async Task<ActionResult<BaseResponse<FleetCommandPollResponse>>> Poll([FromBody] FleetCommandPollRequest request, CancellationToken ct)
    {
        var result = await sender.Send(new PollRobotCommandCommand(RobotCode(), request.StreamId), ct);
        return Ok(new BaseResponse<FleetCommandPollResponse>
        {
            Success = true, Message = result.Command is null ? "No command." : "Current command.",
            Data = new(result.Command is { } command ? Wire(command) : null)
        });
    }

    [HttpPost("{commandId:guid}/results")]
    [RequestSizeLimit(4 * 1024)]
    [EnableRateLimiting("FleetSync")]
    public async Task<ActionResult<BaseResponse<CommandResultAck>>> Results(Guid commandId, [FromBody] FleetCommandResultRequest request, CancellationToken ct)
    {
        if (request.CommandId != commandId)
            throw new ValidationException([new ValidationFailure("CommandId", "commandId must equal the path value.")]);
        // The pipeline commits before this returns, so the robot's acknowledgement always follows the stored result.
        var ack = await sender.Send(new ReportCommandResultCommand(RobotCode(), commandId, request.LegId, request.StreamId, request.Phase,
            request.Outcome, request.Reason, request.ReportedAt), ct);
        return Ok(new BaseResponse<CommandResultAck> { Success = true, Message = ack.Duplicate ? "Result already recorded." : "Result recorded.", Data = ack });
    }

    private string RobotCode() =>
        HttpContext.Items.TryGetValue(FleetRobotAuthentication.RequestProofItemKey, out var value) && value is FleetRobotAuthenticationProof proof
            ? proof.Identity.RobotCode
            : throw new InvalidOperationException("Authenticated Fleet Robot proof was unavailable for this request.");

    private static object Wire(RobotCommand command) => command.Kind == RobotCommandKinds.GoTo
        ? new FleetGoToCommand(command.Id, command.Kind, command.LegId, command.MapKey!, command.FrameId!, (double)command.X!.Value,
            (double)command.Y!.Value, (double)command.Yaw!.Value, command.RouteRevisionStopId, command.IssuedAt, command.AcceptBy!.Value)
        : new FleetCancelCommand(command.Id, command.Kind, command.LegId, command.IssuedAt);
}

public sealed record FleetCommandPollRequest(Guid StreamId);
public sealed record FleetCommandPollResponse(object? Command);
public sealed record FleetGoToCommand(Guid CommandId, string Kind, Guid LegId, string MapKey, string FrameId, double X, double Y, double Yaw,
    Guid? StopId, DateTimeOffset IssuedAt, DateTimeOffset AcceptBy);
public sealed record FleetCancelCommand(Guid CommandId, string Kind, Guid LegId, DateTimeOffset IssuedAt);
public sealed record FleetCommandResultRequest(Guid CommandId, Guid LegId, Guid StreamId, DateTimeOffset ReportedAt, string Phase, string? Outcome, string? Reason);
