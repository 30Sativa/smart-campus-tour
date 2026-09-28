using MediatR;
using Microsoft.AspNetCore.Mvc;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.RobotTelemetry;

namespace SmartCampus.Api.Controllers;

/// <summary>
/// Pose telemetry from robots (physical, Gazebo or emulator), authenticated
/// with the robot's device credential:
/// <c>Authorization: Robot &lt;robotCode&gt;:&lt;secret&gt;</c>.
/// 204 accepted · 400 invalid · 401 bad credential · 409 duplicate, reordered or wrong source.
/// </summary>
[ApiController]
[Route("api/robots")]
public sealed class RobotTelemetryController(ISender sender) : ControllerBase
{
    [HttpPost("telemetry")]
    [RequestSizeLimit(4096)]
    public async Task<IActionResult> Publish(RobotPoseSample sample, CancellationToken cancellationToken)
    {
        if (!RobotAuthorizationHeader.TryParse(Request.Headers.Authorization.ToString(), out var robotCode, out var secret))
            throw new UnauthorizedException("Missing robot credential. Send 'Authorization: Robot <robotCode>:<secret>'.");

        await sender.Send(new PublishRobotPose(robotCode, secret, sample), cancellationToken);
        return NoContent();
    }
}

public static class RobotAuthorizationHeader
{
    private const string Scheme = "Robot ";

    public static bool TryParse(string? header, out string robotCode, out string secret)
    {
        robotCode = secret = string.Empty;
        if (string.IsNullOrEmpty(header) || !header.StartsWith(Scheme, StringComparison.OrdinalIgnoreCase)) return false;
        var value = header[Scheme.Length..].Trim();
        var colon = value.IndexOf(':');
        if (colon <= 0 || colon == value.Length - 1) return false;
        robotCode = value[..colon];
        secret = value[(colon + 1)..];
        return true;
    }
}
