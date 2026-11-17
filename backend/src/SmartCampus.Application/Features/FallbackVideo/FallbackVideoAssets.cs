using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace SmartCampus.Application.Features.FallbackVideo;

/// <summary>
/// ADR-0063: a Tour's fallback video is a Cloudinary <c>authenticated</c> asset, so its delivery URL works only with a
/// signature that only the backend can make. <c>Tours.FallbackVideoUrl</c> keeps the unsigned reference
/// <c>https://res.cloudinary.com/{cloud}/video/authenticated/smartcampus/tours/fallback/{id}.mp4</c>, which plays
/// nowhere; the relay gets a signed URL from the backend and no browser ever sees one.
/// </summary>
public static partial class FallbackVideoAssets
{
    public const string Folder = "smartcampus/tours/fallback/";

    /// <summary>
    /// What the relay plays, made once at upload (eager) so nobody waits for transcoding: at most 1280x720, H.264
    /// Baseline (no B-frames, which WebRTC cannot carry) with a key frame every 2 s so a new viewer starts quickly.
    /// </summary>
    public const string Delivery = "c_limit,h_720,w_1280,vc_h264:baseline:3.1,ki_2.0";

    /// <summary>Cloudinary's Free plan video limit; a larger file is refused by Cloudinary anyway.</summary>
    public const long MaxBytes = 100L * 1024 * 1024;

    public const string AllowedFormats = "mp4,mov,webm,mkv,avi";

    public static string PublicIdFor(Guid id) => Folder + id.ToString("N");

    public static string StoredUrl(string cloudName, string publicId) =>
        $"https://res.cloudinary.com/{cloudName}/video/authenticated/{publicId}.mp4";

    /// <summary>The public ID of a reference made by <see cref="StoredUrl"/> for this cloud, or null for any other URL.</summary>
    public static string? PublicIdOf(string cloudName, string? storedUrl)
    {
        var match = StoredUrlPattern().Match(storedUrl?.Trim() ?? string.Empty);
        return match.Success && string.Equals(match.Groups["cloud"].Value, cloudName, StringComparison.OrdinalIgnoreCase)
            ? match.Groups["id"].Value
            : null;
    }

    /// <summary>The signed delivery URL of the <see cref="Delivery"/> version; only the relay host ever receives it.</summary>
    public static string SignedSourceUrl(CloudinarySettings settings, string publicId)
    {
        var path = $"{Delivery}/{publicId}.mp4";
        return $"https://res.cloudinary.com/{settings.CloudName}/video/authenticated/s--{DeliverySignature(path, settings.ApiSecret!)}--/{path}";
    }

    /// <summary>
    /// Cloudinary delivery URL signature: the first 8 characters of URL-safe Base64 SHA-1 over
    /// "{transformations}/{public ID}.{extension}" followed by the API secret.
    /// </summary>
    public static string DeliverySignature(string signedPath, string apiSecret) =>
        Convert.ToBase64String(SHA1.HashData(Encoding.UTF8.GetBytes(signedPath + apiSecret)))
            .Replace('+', '-').Replace('/', '_')[..8];

    /// <summary>
    /// Cloudinary upload API signature: hex SHA-1 over the parameters sorted by name as "a=1&amp;b=2", followed by the
    /// API secret. <c>file</c>, <c>api_key</c>, <c>resource_type</c> and <c>cloud_name</c> are not signed.
    /// </summary>
    public static string UploadSignature(IReadOnlyDictionary<string, string> parameters, string apiSecret)
    {
        var text = string.Join('&', parameters.OrderBy(pair => pair.Key, StringComparer.Ordinal)
            .Select(pair => pair.Key + "=" + pair.Value));
        return Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(text + apiSecret)));
    }

    /// <summary>The fields of one signed upload of a new fallback video, valid for about an hour (Cloudinary's limit).</summary>
    public static Dictionary<string, string> UploadFields(CloudinarySettings settings, string publicId, DateTimeOffset now)
    {
        var signed = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["allowed_formats"] = AllowedFormats,
            ["eager"] = Delivery + "/mp4",
            ["eager_async"] = "true",
            ["public_id"] = publicId,
            ["timestamp"] = now.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture),
            ["type"] = "authenticated",
        };
        var fields = new Dictionary<string, string>(signed, StringComparer.Ordinal)
        {
            ["api_key"] = settings.ApiKey!,
            ["signature"] = UploadSignature(signed, settings.ApiSecret!),
        };
        return fields;
    }

    [GeneratedRegex(@"^https://res\.cloudinary\.com/(?<cloud>[A-Za-z][A-Za-z0-9-]{1,127})/video/authenticated/(?<id>smartcampus/tours/fallback/[0-9a-f]{32})\.mp4$")]
    private static partial Regex StoredUrlPattern();
}
