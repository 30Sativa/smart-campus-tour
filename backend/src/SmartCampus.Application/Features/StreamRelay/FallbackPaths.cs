namespace SmartCampus.Application.Features.StreamRelay;

/// <summary>ADR-0063: the relay path that carries one Tour's fallback video, <c>fallback-{tourId:N}</c>.</summary>
public static class FallbackPaths
{
    private const string Prefix = "fallback-";

    /// <summary>The MediaMTX user of the relay host's on-demand publisher; its password is the relay key.</summary>
    public const string PublishUser = "fallback";

    public static string For(Guid tourId) => Prefix + tourId.ToString("N");

    /// <summary>True only for the exact form <see cref="For"/> makes (lower-case, no dashes).</summary>
    public static bool TryParse(string? path, out Guid tourId)
    {
        tourId = Guid.Empty;
        return path is { Length: 41 } && path.StartsWith(Prefix, StringComparison.Ordinal)
            && Guid.TryParseExact(path[Prefix.Length..], "N", out tourId) && path == For(tourId);
    }
}
