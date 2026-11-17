using MediatR;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.FallbackVideo;

/// <summary>
/// What the Staff page needs to send one new fallback video straight to Cloudinary (ADR-0063): POST the file with every
/// field of <see cref="Fields"/> to <see cref="UploadUrl"/>, then save <see cref="StoredUrl"/> as the Tour's
/// <c>fallbackVideoUrl</c>. The video never passes through the API.
/// </summary>
public sealed record FallbackVideoUpload(string UploadUrl, IReadOnlyDictionary<string, string> Fields, string StoredUrl, long MaxBytes);

/// <summary>Signs one upload under a fresh public ID, so a stored or snapshotted reference is never overwritten.</summary>
public sealed record GetFallbackVideoUploadQuery : IRequest<FallbackVideoUpload>;

public sealed class GetFallbackVideoUploadQueryHandler(CloudinarySettings settings, TimeProvider clock)
    : IRequestHandler<GetFallbackVideoUploadQuery, FallbackVideoUpload>
{
    public const string Unavailable = "FALLBACK_VIDEO_UPLOAD_UNAVAILABLE";

    public Task<FallbackVideoUpload> Handle(GetFallbackVideoUploadQuery query, CancellationToken ct)
    {
        if (!settings.Enabled)
            throw new ServiceUnavailableException("Máy chủ chưa cấu hình Cloudinary nên chưa tải được video dự phòng.", Unavailable);
        var publicId = FallbackVideoAssets.PublicIdFor(Guid.NewGuid());
        return Task.FromResult(new FallbackVideoUpload(
            $"https://api.cloudinary.com/v1_1/{settings.CloudName}/video/upload",
            FallbackVideoAssets.UploadFields(settings, publicId, clock.GetUtcNow()),
            FallbackVideoAssets.StoredUrl(settings.CloudName!, publicId),
            FallbackVideoAssets.MaxBytes));
    }
}
