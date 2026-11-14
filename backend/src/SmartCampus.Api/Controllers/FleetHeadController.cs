using System.Text.Json.Serialization;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Api.Hubs;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetHead;
using SmartCampus.Application.Features.FleetHead.Commands.PollHeadCommands;
using SmartCampus.Application.Features.FleetHead.Queries.GetRobotHeadPois;

namespace SmartCampus.Api.Controllers;

public static class FleetHeadRateLimit
{
    /// <summary>Robot head poll and Operator head commands; its own budget, so head traffic never starves Fleet Sync.</summary>
    public const string Policy = "FleetHead";
}

/// <summary>
/// docs/contracts/fleet-head/v1 (ADR-0045): the robot long-polls the Operator's head commands, and reads its POIs with
/// their camera presets so it can turn the head by itself when Nav2 reaches one.
/// </summary>
[ApiController]
[Route("api/fleet/head/v1")]
[Authorize(AuthenticationSchemes = FleetRobotAuthentication.Scheme)]
public sealed class FleetHeadController(ISender sender) : ControllerBase
{
    [HttpPost("poll")]
    [RequestSizeLimit(4 * 1024)]
    [EnableRateLimiting(FleetHeadRateLimit.Policy)]
    public async Task<ActionResult<BaseResponse<FleetHeadPollResponse>>> Poll([FromBody] FleetHeadPollRequest request, CancellationToken ct)
    {
        HeadPollBatch batch;
        try
        {
            batch = await sender.Send(new PollHeadCommands(RobotCode(), request.Epoch, request.AfterSeq, request.WaitMs,
                request.Head is { } head
                    ? new HeadStateReport(head.State, head.Referenced, head.PanDeg, head.TiltDeg, head.ObservedAt)
                    : null), ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // The robot dropped the connection while the poll waited; nobody reads this response.
            return new EmptyResult();
        }

        return Ok(new BaseResponse<FleetHeadPollResponse>
        {
            Success = true,
            Message = batch.Commands.Count == 0 ? "No head command." : "Head commands.",
            Data = new FleetHeadPollResponse(batch.Epoch, batch.Commands.Select(Wire).ToArray())
        });
    }

    /// <summary>The robot's POIs and camera presets, and whether it may turn the head by itself (<c>autoMotion</c>).</summary>
    [HttpGet("pois")]
    [EnableRateLimiting(FleetHeadRateLimit.Policy)]
    public async Task<ActionResult<BaseResponse<RobotHeadPois>>> Pois(CancellationToken ct)
    {
        var pois = await sender.Send(new GetRobotHeadPoisQuery(RobotCode()), ct);
        return Ok(new BaseResponse<RobotHeadPois>
        {
            Success = true,
            Message = pois.Source switch
            {
                RobotHeadPoiSources.Tour => "POIs of the running Tour.",
                RobotHeadPoiSources.Map => "Verified POIs on the robot's map.",
                _ => "No POIs for this robot."
            },
            Data = pois
        });
    }

    private string RobotCode() =>
        HttpContext.Items.TryGetValue(FleetRobotAuthentication.RequestProofItemKey, out var value) && value is FleetRobotAuthenticationProof proof
            ? proof.Identity.RobotCode
            : throw new InvalidOperationException("Authenticated Fleet Robot proof was unavailable for this request.");

    private static FleetHeadWireCommand Wire(HeadCommand command) => new(command.Seq, command.Kind, command.IssuedAt,
        command.PanSteps, command.TiltSteps, command.PanDir, command.TiltDir, command.PanDeg, command.TiltDeg, command.TtlMs,
        command.SweepDeg);
}

public sealed record FleetHeadPollRequest(Guid? Epoch, long AfterSeq, int WaitMs, FleetHeadStateRequest? Head);

public sealed record FleetHeadStateRequest(string State, bool Referenced, double? PanDeg, double? TiltDeg, DateTimeOffset? ObservedAt);

public sealed record FleetHeadPollResponse(Guid Epoch, FleetHeadWireCommand[] Commands);

/// <summary>Only the fields of the command's kind appear on the wire.</summary>
public sealed record FleetHeadWireCommand(
    long Seq,
    string Kind,
    DateTimeOffset IssuedAt,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? PanSteps,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? TiltSteps,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? PanDir,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? TiltDir,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] double? PanDeg,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] double? TiltDeg,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? TtlMs,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? SweepDeg);

/// <summary>Body of PUT /api/staff/manage/tours/{id}/head-mode: <c>AUTO</c> or <c>MANUAL</c>.</summary>
public sealed record StaffHeadModeRequest(string Mode);

/// <summary>Body of POST /api/staff/manage/tours/{id}/head-commands; only the fields of <see cref="Kind"/> may be set.</summary>
public sealed record StaffHeadCommandRequest(string Kind, int? PanSteps, int? TiltSteps, int? PanDir, int? TiltDir,
    double? PanDeg, double? TiltDeg, int? SweepDeg = null);
