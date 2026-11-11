using System.Security.Cryptography;
using System.Text;
using MediatR;

namespace SmartCampus.Application.Features.StreamRelay;

/// <summary>What the relay's authorization endpoint answers.</summary>
public enum RelayDecision
{
    Allow,
    /// <summary>The caller is the relay but the action is not allowed (MediaMTX refuses; the reaper kicks).</summary>
    Deny,
    /// <summary>The caller did not present the relay key; nothing is decided.</summary>
    UnknownCaller,
}

/// <summary>
/// One MediaMTX <c>authMethod: http</c> request (ADR-0055), or the reaper's recheck of an open session
/// (<see cref="Recheck"/>). In memory and read-only: not an ICommand.
/// </summary>
public sealed record AuthorizeRelayRequest(string? RelayKey, string? Action, string? Path, string? User, string? Password,
    string? Token, string? Query, bool Recheck = false) : IRequest<RelayDecision>;

public sealed class AuthorizeRelayRequestHandler(StreamRelaySettings settings, StreamEntitlement entitlement)
    : IRequestHandler<AuthorizeRelayRequest, RelayDecision>
{
    public async Task<RelayDecision> Handle(AuthorizeRelayRequest request, CancellationToken ct)
    {
        if (!settings.Enabled || !SameSecret(request.RelayKey, settings.Key!))
            return RelayDecision.UnknownCaller;
        if (!string.Equals(request.Path, settings.Path, StringComparison.Ordinal))
            return RelayDecision.Deny;
        if (request.Recheck)
            return await entitlement.TokenMayReadAsync(StreamTokens.FromQuery(request.Query), ignoreExpiry: true, ct)
                ? RelayDecision.Allow : RelayDecision.Deny;
        return request.Action switch
        {
            "publish" => PublisherMatches(request.User, request.Password) ? RelayDecision.Allow : RelayDecision.Deny,
            // The browser sends the token in the WHEP URL, so the reaper can see it later in the session's query.
            "read" => await entitlement.TokenMayReadAsync(StreamTokens.FromQuery(request.Query) ?? request.Token,
                ignoreExpiry: false, ct) ? RelayDecision.Allow : RelayDecision.Deny,
            _ => RelayDecision.Deny,
        };
    }

    private bool PublisherMatches(string? user, string? password)
    {
        var userMatches = SameSecret(user, settings.PublishUser!);
        var passwordMatches = CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(password ?? string.Empty)), settings.PublishPasswordSha256);
        return userMatches & passwordMatches;
    }

    private static bool SameSecret(string? given, string expected) =>
        CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(given ?? string.Empty)), SHA256.HashData(Encoding.UTF8.GetBytes(expected)));
}
