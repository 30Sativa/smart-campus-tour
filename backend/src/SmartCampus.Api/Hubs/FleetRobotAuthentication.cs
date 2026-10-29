using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using SmartCampus.Application.Common.Abstractions.FleetSync;

namespace SmartCampus.Api.Hubs;

public static class FleetRobotAuthentication
{
    public const string Scheme = "FleetRobot";
    public const string RobotCodeClaim = "robot_code";
    public const string SourceTypeClaim = "robot_source_type";
    public const string DisplayNameClaim = "robot_display_name";
    public const string NeedsInspectionClaim = "robot_needs_inspection";
    public static readonly object RequestProofItemKey = new();
}

public sealed class FleetRobotAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IFleetRobotAuthenticator authenticator)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!System.Net.Http.Headers.AuthenticationHeaderValue.TryParse(
                Request.Headers.Authorization.ToString(), out var authorization) ||
            !string.Equals(authorization.Scheme, "Bearer", StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrEmpty(authorization.Parameter))
            return AuthenticateResult.NoResult();

        var robotCode = Request.Headers["X-Robot-Code"].ToString();
        if (robotCode.Length is 0 or > 100 ||
            !System.Text.RegularExpressions.Regex.IsMatch(robotCode, "^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$"))
            return AuthenticateResult.Fail("Invalid fleet credentials.");

        var authentication = await authenticator.AuthenticateAsync(robotCode, authorization.Parameter, Context.RequestAborted);
        if (authentication is null)
            return AuthenticateResult.Fail("Invalid fleet credentials.");

        Context.Items[FleetRobotAuthentication.RequestProofItemKey] = authentication;
        var robot = authentication.Identity;

        var claims = new List<Claim>
        {
            new(FleetRobotAuthentication.RobotCodeClaim, robot.RobotCode),
            new(FleetRobotAuthentication.SourceTypeClaim, robot.SourceType),
            new(FleetRobotAuthentication.NeedsInspectionClaim, robot.NeedsInspection.ToString())
        };
        if (!string.IsNullOrWhiteSpace(robot.DisplayName))
            claims.Add(new Claim(FleetRobotAuthentication.DisplayNameClaim, robot.DisplayName));

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name));
    }
}
