using System.Globalization;
using System.Text.RegularExpressions;
using SmartCampus.Application.Features.FallbackVideo;

namespace SmartCampus.Application.Features.Profile;

/// <summary>
/// ADR-0064: an account's avatar is a public Cloudinary image under <c>smartcampus/avatars/{userId:N}/</c>, uploaded by
/// the browser with a backend signature. Every upload gets a fresh public ID, so a new picture never needs a cache purge.
/// <c>Users.AvatarUrl</c> keeps <c>https://res.cloudinary.com/{cloud}/image/upload/{publicId}</c>; the web adds the size.
/// </summary>
public static partial class AvatarAssets
{
    public const string Folder = "smartcampus/avatars/";

    /// <summary>Cloudinary's Free plan image limit.</summary>
    public const long MaxBytes = 10L * 1024 * 1024;

    public const string AllowedFormats = "jpg,jpeg,png,webp,heic,heif";

    /// <summary>Stored at most 1024 px on its longer side, whatever the phone camera made.</summary>
    public const string Incoming = "c_limit,h_1024,w_1024";

    public static string PublicIdFor(Guid userId, Guid uploadId) => $"{Folder}{userId:N}/{uploadId:N}";

    public static string StoredUrl(string cloudName, string publicId) => $"https://res.cloudinary.com/{cloudName}/image/upload/{publicId}";

    /// <summary>True only for a reference <see cref="StoredUrl"/> made for this account in this cloud.</summary>
    public static bool IsOwnUpload(string cloudName, Guid userId, string? url)
    {
        var match = StoredUrlPattern().Match(url ?? string.Empty);
        return match.Success
            && string.Equals(match.Groups["cloud"].Value, cloudName, StringComparison.OrdinalIgnoreCase)
            && match.Groups["user"].Value == userId.ToString("N");
    }

    /// <summary>The fields of one signed upload of a new avatar, valid for about an hour (Cloudinary's limit).</summary>
    public static Dictionary<string, string> UploadFields(CloudinarySettings settings, string publicId, DateTimeOffset now)
    {
        var signed = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["allowed_formats"] = AllowedFormats,
            ["public_id"] = publicId,
            ["timestamp"] = now.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture),
            ["transformation"] = Incoming,
        };
        return new Dictionary<string, string>(signed, StringComparer.Ordinal)
        {
            ["api_key"] = settings.ApiKey!,
            ["signature"] = FallbackVideoAssets.UploadSignature(signed, settings.ApiSecret!),
        };
    }

    [GeneratedRegex(@"^https://res\.cloudinary\.com/(?<cloud>[A-Za-z][A-Za-z0-9-]{1,127})/image/upload/smartcampus/avatars/(?<user>[0-9a-f]{32})/[0-9a-f]{32}$")]
    private static partial Regex StoredUrlPattern();
}
