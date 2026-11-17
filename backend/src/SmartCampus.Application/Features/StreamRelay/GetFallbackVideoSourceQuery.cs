using System.Security.Cryptography;
using System.Text;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FallbackVideo;

namespace SmartCampus.Application.Features.StreamRelay;

/// <summary>What the relay host's on-demand publisher may play for a fallback path.</summary>
public sealed record FallbackVideoSource(RelayDecision Decision, string? Url = null);

/// <summary>
/// ADR-0063: asked by the relay host's on-demand ffmpeg, with the relay key, when the first viewer opens
/// <c>fallback-{tourId}</c>. Answers the signed Cloudinary URL of that Tour's fallback video while the Tour is RUNNING.
/// Only a reference made by the Staff upload (<see cref="FallbackVideoAssets.StoredUrl"/>) is ever played, so the relay
/// host never fetches an address someone typed. In memory and read-only: not an ICommand.
/// </summary>
public sealed record GetFallbackVideoSourceQuery(string? RelayKey, string? Path) : IRequest<FallbackVideoSource>;

public sealed class GetFallbackVideoSourceQueryHandler(StreamRelaySettings relay, CloudinarySettings cloudinary,
    IStreamEntitlementReader reader) : IRequestHandler<GetFallbackVideoSourceQuery, FallbackVideoSource>
{
    public async Task<FallbackVideoSource> Handle(GetFallbackVideoSourceQuery query, CancellationToken ct)
    {
        if (!relay.Enabled || !CryptographicOperations.FixedTimeEquals(
                SHA256.HashData(Encoding.UTF8.GetBytes(query.RelayKey ?? string.Empty)), SHA256.HashData(Encoding.UTF8.GetBytes(relay.Key!))))
            return new(RelayDecision.UnknownCaller);
        if (!cloudinary.Enabled || !FallbackPaths.TryParse(query.Path, out var tourId))
            return new(RelayDecision.Deny);
        var publicId = FallbackVideoAssets.PublicIdOf(cloudinary.CloudName!, await reader.RunningTourFallbackVideoAsync(tourId, ct));
        return publicId is null
            ? new(RelayDecision.Deny)
            : new(RelayDecision.Allow, FallbackVideoAssets.SignedSourceUrl(cloudinary, publicId));
    }
}
