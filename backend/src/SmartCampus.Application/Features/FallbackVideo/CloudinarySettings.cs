using System.Text.RegularExpressions;

namespace SmartCampus.Application.Features.FallbackVideo;

/// <summary>
/// The <c>Cloudinary</c> section of ADR-0063: where Tour fallback videos are stored. All three values or none; without
/// them no upload is signed and no fallback video reaches the relay. The secret never leaves the backend.
/// </summary>
public sealed partial class CloudinarySettings
{
    public CloudinarySettings(string? cloudName = null, string? apiKey = null, string? apiSecret = null)
    {
        var configured = new[] { cloudName, apiKey, apiSecret }.Count(value => !string.IsNullOrWhiteSpace(value));
        if (configured == 0)
            return;
        if (configured != 3)
            throw new InvalidOperationException("Cloudinary:CloudName, Cloudinary:ApiKey and Cloudinary:ApiSecret must be set together.");
        if (!CloudNamePattern().IsMatch(cloudName!.Trim()))
            throw new InvalidOperationException("Cloudinary:CloudName must be 2-128 letters, digits or hyphens, starting with a letter.");
        CloudName = cloudName.Trim().ToLowerInvariant();
        ApiKey = apiKey!.Trim();
        ApiSecret = apiSecret!.Trim();
    }

    public bool Enabled => CloudName is not null;

    public string? CloudName { get; }

    /// <summary>Not secret: Cloudinary's signed upload sends it from the browser.</summary>
    public string? ApiKey { get; }

    public string? ApiSecret { get; }

    [GeneratedRegex("^[A-Za-z][A-Za-z0-9-]{1,127}$")]
    private static partial Regex CloudNamePattern();
}
