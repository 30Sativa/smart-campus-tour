using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using FluentValidation;
using SmartCampus.Application.Features.FallbackVideo;

namespace SmartCampus.Application.Features.TechnicalEvidence;

/// <summary>
/// ADR-0072: photos a Technical Staff member attaches to a map deployment check, a manual POI verification or a route test
/// run. Each is a public Cloudinary image under <c>smartcampus/technical-evidence/{userId:N}/{uploadId:N}</c>, uploaded by
/// the browser with a backend signature before the record is saved; the record keeps the delivery URLs as a JSON array in
/// its <c>EvidencePhotoUrlsJson</c> column. A record accepts only photos its own checker uploaded to this cloud.
/// </summary>
public static partial class TechnicalEvidencePhotos
{
    public const string Folder = "smartcampus/technical-evidence/";

    public const int MaxPhotos = 5;

    /// <summary>Cloudinary's Free plan image limit.</summary>
    public const long MaxBytes = 10L * 1024 * 1024;

    public const string AllowedFormats = "jpg,jpeg,png,webp,heic,heif";

    /// <summary>Stored at most 2048 px on its longer side: enough to read a screen or a floor mark, not a raw 12 MP file.</summary>
    public const string Incoming = "c_limit,h_2048,w_2048";

    public static string PublicIdFor(Guid userId, Guid uploadId) => $"{Folder}{userId:N}/{uploadId:N}";

    public static string StoredUrl(string cloudName, string publicId) => $"https://res.cloudinary.com/{cloudName}/image/upload/{publicId}";

    /// <summary>True only for a reference <see cref="StoredUrl"/> made for <paramref name="userId"/> in this cloud.</summary>
    public static bool IsOwnUpload(string cloudName, Guid userId, string? url)
    {
        var match = StoredUrlPattern().Match(url ?? string.Empty);
        return match.Success
            && string.Equals(match.Groups["cloud"].Value, cloudName, StringComparison.OrdinalIgnoreCase)
            && match.Groups["user"].Value == userId.ToString("N");
    }

    /// <summary>The fields of one signed upload of a new evidence photo, valid for about an hour (Cloudinary's limit).</summary>
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

    /// <summary>
    /// The photos a record keeps, in the order sent: none for a null or empty list; otherwise at most
    /// <see cref="MaxPhotos"/> distinct URLs that <paramref name="checkerUserId"/> uploaded to this cloud.
    /// </summary>
    public static IReadOnlyList<string> Normalize(IReadOnlyList<string>? urls, CloudinarySettings settings, Guid checkerUserId)
    {
        if (urls is null || urls.Count == 0)
            return [];
        if (urls.Count > MaxPhotos)
            throw new ValidationException($"Mỗi biên bản đính kèm tối đa {MaxPhotos} ảnh bằng chứng.");
        if (!settings.Enabled)
            throw new ValidationException("Máy chủ chưa cấu hình Cloudinary nên chưa nhận ảnh bằng chứng.");
        var photos = urls.Select(url => url?.Trim() ?? string.Empty).ToArray();
        if (photos.Any(url => !IsOwnUpload(settings.CloudName!, checkerUserId, url)))
            throw new ValidationException("Ảnh bằng chứng phải là ảnh chính tài khoản này vừa tải lên Cloudinary của hệ thống.");
        if (photos.Distinct(StringComparer.Ordinal).Count() != photos.Length)
            throw new ValidationException("Một ảnh bằng chứng chỉ đính kèm một lần.");
        return photos;
    }

    /// <summary>The column value: null when there are no photos, so a record without photos stays as before.</summary>
    public static string? Write(IReadOnlyList<string> photos) => photos.Count == 0 ? null : JsonSerializer.Serialize(photos);

    /// <summary>The stored photos, or none for a record saved without them (or a value this version cannot read).</summary>
    public static IReadOnlyList<string> Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];
        try
        {
            return JsonSerializer.Deserialize<string[]>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    [GeneratedRegex(@"^https://res\.cloudinary\.com/(?<cloud>[A-Za-z][A-Za-z0-9-]{1,127})/image/upload/smartcampus/technical-evidence/(?<user>[0-9a-f]{32})/[0-9a-f]{32}$")]
    private static partial Regex StoredUrlPattern();
}
