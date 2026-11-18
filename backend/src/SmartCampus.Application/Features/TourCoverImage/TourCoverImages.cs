using System.Globalization;
using SmartCampus.Application.Features.FallbackVideo;

namespace SmartCampus.Application.Features.TourCoverImage;

/// <summary>
/// A Tour's cover image (the picture a School Representative sees on the Tour's card) is a public Cloudinary image
/// whose public ID is fixed by the Tour's id: <c>smartcampus/tours/cover/{tourId:N}</c>. Nothing is stored in the
/// database; a Tour without an upload simply has no image there and the web shows its sample picture instead.
/// Uploading again replaces the image (overwrite) and asks Cloudinary to purge its CDN copy (invalidate).
/// </summary>
public static class TourCoverImages
{
    public const string Folder = "smartcampus/tours/cover/";

    /// <summary>Plenty for a 1200x675 photo; Cloudinary's Free plan refuses images over 10 MB anyway.</summary>
    public const long MaxBytes = 10L * 1024 * 1024;

    public const string AllowedFormats = "jpg,jpeg,png,webp,avif";

    public static string PublicIdFor(Guid tourId) => Folder + tourId.ToString("N");

    /// <summary>The fields of one signed upload of the cover of <paramref name="tourId"/>, valid for about an hour.</summary>
    public static Dictionary<string, string> UploadFields(CloudinarySettings settings, Guid tourId, DateTimeOffset now)
    {
        var signed = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["allowed_formats"] = AllowedFormats,
            ["invalidate"] = "true",
            ["overwrite"] = "true",
            ["public_id"] = PublicIdFor(tourId),
            ["timestamp"] = now.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture),
        };
        return new Dictionary<string, string>(signed, StringComparer.Ordinal)
        {
            ["api_key"] = settings.ApiKey!,
            ["signature"] = FallbackVideoAssets.UploadSignature(signed, settings.ApiSecret!),
        };
    }
}
