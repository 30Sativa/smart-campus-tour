using System.Text.Json.Serialization;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartCampus.Application.Features.StreamRelay;

namespace SmartCampus.Api.Controllers;

/// <summary>
/// ADR-0055: called only by the public MediaMTX relay (<c>authMethod: http</c>) and by its reaper on the same host.
/// Both present the relay key in the query. The answers carry no body: 204 allows, 403 refuses, 401 means the caller is
/// not the relay. MediaMTX refuses on any non-2xx; the reaper kicks a session only on 403.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/internal/stream-relay")]
[EnableRateLimiting(StreamRelayRateLimit.Policy)]
public sealed class StreamRelayController(ISender sender) : ControllerBase
{
    [HttpPost("auth")]
    [RequestSizeLimit(8 * 1024)]
    public async Task<IActionResult> Authorize([FromQuery] string? key, [FromBody] MediaMtxAuthRequest request, CancellationToken ct) =>
        Answer(await sender.Send(new AuthorizeRelayRequest(key, request.Action, request.Path, request.User, request.Password,
            request.Token, request.Query), ct));

    [HttpPost("recheck")]
    [RequestSizeLimit(8 * 1024)]
    public async Task<IActionResult> Recheck([FromQuery] string? key, [FromBody] RelaySessionRecheck request, CancellationToken ct) =>
        Answer(await sender.Send(new AuthorizeRelayRequest(key, "read", request.Path, null, null, null, request.Query,
            Recheck: true), ct));

    private IActionResult Answer(RelayDecision decision)
    {
        Response.Headers.CacheControl = "no-store";
        return decision switch
        {
            RelayDecision.Allow => NoContent(),
            RelayDecision.Deny => StatusCode(StatusCodes.Status403Forbidden),
            _ => Unauthorized(),
        };
    }
}

/// <summary>The body MediaMTX sends to <c>authHTTPAddress</c>; unknown fields are ignored.</summary>
public sealed record MediaMtxAuthRequest(
    [property: JsonPropertyName("user")] string? User,
    [property: JsonPropertyName("password")] string? Password,
    [property: JsonPropertyName("token")] string? Token,
    [property: JsonPropertyName("ip")] string? Ip,
    [property: JsonPropertyName("action")] string? Action,
    [property: JsonPropertyName("path")] string? Path,
    [property: JsonPropertyName("protocol")] string? Protocol,
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("query")] string? Query);

/// <summary>One open WebRTC session as the reaper read it from the MediaMTX API.</summary>
public sealed record RelaySessionRecheck(
    [property: JsonPropertyName("path")] string? Path,
    [property: JsonPropertyName("query")] string? Query);

public static class StreamRelayRateLimit
{
    public const string Policy = "StreamRelay";
}
