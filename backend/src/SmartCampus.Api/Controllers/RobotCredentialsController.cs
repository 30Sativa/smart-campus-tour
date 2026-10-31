using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.RobotCredentials;

namespace SmartCampus.Api.Controllers;

public sealed record RobotCredentialSecretResponse(string Secret, string Hint, DateTimeOffset IssuedAt);
public sealed record RobotCredentialRevocationResponse(string RobotCode, string Status, string? Hint);
public sealed record StaffRobotConnectionStatus(
    Guid Id, string RobotCode, string? DisplayName, string ConnectionStatus, DateTimeOffset? LastSyncReceivedAt);

[ApiController]
[Route("api")]
public sealed class RobotCredentialsController(ISender sender) : ControllerBase
{
    private const string TechnicalAndAdmin = ApplicationRoles.TechnicalStaff + "," + ApplicationRoles.Admin;

    [HttpPost("technical/robots/{robotCode}/credential")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public Task<ActionResult<BaseResponse<RobotCredentialSecretResponse>>> Issue(
        string robotCode, [FromBody] ChangeRobotCredentialRequest request, CancellationToken ct) =>
        ChangeSecret(robotCode, request, RobotCredentialOperation.Issue, ct);

    [HttpPost("technical/robots/{robotCode}/credential/rotate")]
    [Authorize(Roles = ApplicationRoles.TechnicalStaff)]
    public Task<ActionResult<BaseResponse<RobotCredentialSecretResponse>>> Rotate(
        string robotCode, [FromBody] ChangeRobotCredentialRequest request, CancellationToken ct) =>
        ChangeSecret(robotCode, request, RobotCredentialOperation.Rotate, ct);

    [HttpPost("robots/{robotCode}/credential/revoke")]
    [Authorize(Roles = TechnicalAndAdmin)]
    public async Task<ActionResult<BaseResponse<RobotCredentialRevocationResponse>>> Revoke(
        string robotCode, [FromBody] RevokeRobotCredentialRequest request, CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        var result = await sender.Send(new ChangeRobotCredentialCommand(robotCode,
            User.GetRequiredUserId(), request.RequestId, request.ExpectedRowVersion, request.Reason,
            RobotCredentialOperation.Revoke), ct);
        return Ok(new BaseResponse<RobotCredentialRevocationResponse>
        {
            Success = true,
            Message = "Credential revoked. The MiniPC must be reconfigured before it can connect again.",
            Data = new RobotCredentialRevocationResponse(result.RobotCode, result.Status, result.Hint)
        });
    }

    [HttpGet("robots/{robotCode}/credential")]
    [Authorize(Roles = TechnicalAndAdmin)]
    public async Task<ActionResult<BaseResponse<RobotCredentialView>>> Get(string robotCode, CancellationToken ct) =>
        Ok(new BaseResponse<RobotCredentialView>
        {
            Success = true,
            Message = "Robot credential status retrieved.",
            Data = await sender.Send(new GetRobotCredentialQuery(robotCode), ct)
        });

    [HttpGet("admin/audit-logs")]
    [Authorize(Roles = ApplicationRoles.Admin)]
    public async Task<ActionResult<BaseResponse<SmartCampus.Application.Common.Models.PagedResult<RobotCredentialAuditEntry>>>>
        ListAudit([FromQuery] string? action, [FromQuery] string? robotCode,
            [FromQuery] Guid? actorUserId, [FromQuery] DateTimeOffset? from,
            [FromQuery] DateTimeOffset? to, [FromQuery] int page = 1, CancellationToken ct = default) =>
        Ok(new BaseResponse<SmartCampus.Application.Common.Models.PagedResult<RobotCredentialAuditEntry>>
        {
            Success = true,
            Message = "Robot credential audit entries retrieved.",
            Data = await sender.Send(new ListRobotCredentialAuditQuery(action, robotCode, actorUserId, from, to, page), ct)
        });

    [HttpGet("staff/physical-robots")]
    [Authorize(Roles = ApplicationRoles.Staff)]
    public async Task<ActionResult<BaseResponse<IReadOnlyList<StaffRobotConnectionStatus>>>> ListStaffConnectionStatus(CancellationToken ct)
    {
        var robots = await sender.Send(new ListPhysicalRobotsQuery(), ct);
        return Ok(new BaseResponse<IReadOnlyList<StaffRobotConnectionStatus>>
        {
            Success = true,
            Message = "Physical robot connection status retrieved.",
            Data = robots.Select(robot => new StaffRobotConnectionStatus(robot.Id, robot.RobotCode,
                robot.DisplayName, robot.ConnectionStatus, robot.LastSyncReceivedAt)).ToArray()
        });
    }

    private async Task<ActionResult<BaseResponse<RobotCredentialSecretResponse>>> ChangeSecret(
        string robotCode, ChangeRobotCredentialRequest request, RobotCredentialOperation operation,
        CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers.Pragma = "no-cache";
        var result = await sender.Send(new ChangeRobotCredentialCommand(robotCode,
            User.GetRequiredUserId(), request.RequestId, request.ExpectedRowVersion, request.Reason, operation), ct);
        return Ok(new BaseResponse<RobotCredentialSecretResponse>
        {
            Success = true,
            Message = operation == RobotCredentialOperation.Issue
                ? "Credential issued. It is shown once; store it in the MiniPC private credential file."
                : "Credential rotated. The previous key is invalid; reconfigure the MiniPC with this key.",
            Data = new RobotCredentialSecretResponse(result.Secret!, result.Hint!, result.IssuedAt!.Value)
        });
    }
}
