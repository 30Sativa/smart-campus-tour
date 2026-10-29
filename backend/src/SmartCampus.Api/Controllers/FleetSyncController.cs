using MediatR;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Api.Hubs;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.FleetSync.Commands.SyncFleetTelemetry;

namespace SmartCampus.Api.Controllers;

[ApiController]
[Route("api/fleet/v1/sync")]
[Authorize(AuthenticationSchemes = FleetRobotAuthentication.Scheme)]
public sealed class FleetSyncController(
    ISender sender,
    FleetOperationsBroadcaster broadcaster) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(16 * 1024)]
    [EnableRateLimiting("FleetSync")]
    public async Task<ActionResult<BaseResponse<FleetSyncResponse>>> Sync(
        [FromBody] FleetSyncRequest request,
        CancellationToken cancellationToken)
    {
        if (!HttpContext.Items.TryGetValue(FleetRobotAuthentication.RequestProofItemKey, out var proofValue) ||
            proofValue is not FleetRobotAuthenticationProof proof)
            throw new InvalidOperationException("Authenticated Fleet Robot proof was unavailable for this request.");

        var result = await sender.Send(new SyncFleetTelemetry(
            proof.Identity, request.ToReport(), proof.VerifiedCredentialHash,
            proof.IsConnectionConfirmedForCredential), cancellationToken);
        broadcaster.NotifyTelemetryUpdated();

        return Ok(new BaseResponse<FleetSyncResponse>
        {
            Success = true,
            Message = result.Duplicate ? "Telemetry already reconciled." : "Telemetry reconciled.",
            Data = new FleetSyncResponse(true, result.Duplicate, result.ReceivedAt, [])
        });
    }
}

public sealed record FleetSyncRequest(
    string RobotId,
    Guid StreamId,
    long Seq,
    DateTimeOffset ReportedAt,
    string MapKey,
    string FrameId,
    FleetPoseRequest? Pose,
    string Status,
    Guid? LegId,
    bool? Localized,
    bool? MotionReady,
    string? FaultCode,
    double? BatteryPercent)
{
    public FleetTelemetryReport ToReport() => new(
        RobotId, StreamId, Seq, ReportedAt, MapKey, FrameId,
        Pose is null ? null : new FleetPose(Pose.X, Pose.Y, Pose.Yaw, Pose.CapturedAt),
        Status, LegId, Localized, MotionReady, FaultCode, BatteryPercent);
}

public sealed record FleetPoseRequest(double X, double Y, double Yaw, DateTimeOffset CapturedAt);

public sealed record FleetSyncResponse(
    bool Accepted,
    bool Duplicate,
    DateTimeOffset ReceivedAt,
    IReadOnlyList<object> Commands);
