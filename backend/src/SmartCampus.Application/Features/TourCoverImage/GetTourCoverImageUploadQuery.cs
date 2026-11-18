using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FallbackVideo;

namespace SmartCampus.Application.Features.TourCoverImage;

/// <summary>
/// What the Staff page needs to send a Tour's cover image straight to Cloudinary: POST the file with every field of
/// <see cref="Fields"/> to <see cref="UploadUrl"/>. The image never passes through the API.
/// </summary>
public sealed record TourCoverImageUpload(string UploadUrl, IReadOnlyDictionary<string, string> Fields, long MaxBytes);

public sealed record GetTourCoverImageUploadQuery(Guid TourId) : IRequest<TourCoverImageUpload>;

public sealed class GetTourCoverImageUploadQueryHandler(CloudinarySettings settings, ITourManagementRepository tours, TimeProvider clock)
    : IRequestHandler<GetTourCoverImageUploadQuery, TourCoverImageUpload>
{
    public const string Unavailable = "TOUR_COVER_IMAGE_UPLOAD_UNAVAILABLE";

    public async Task<TourCoverImageUpload> Handle(GetTourCoverImageUploadQuery query, CancellationToken ct)
    {
        if (!settings.Enabled)
            throw new ServiceUnavailableException("Máy chủ chưa cấu hình Cloudinary nên chưa tải được ảnh Tour.", Unavailable);
        _ = await tours.FindAsync(query.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        return new TourCoverImageUpload(
            $"https://api.cloudinary.com/v1_1/{settings.CloudName}/image/upload",
            TourCoverImages.UploadFields(settings, query.TourId, clock.GetUtcNow()),
            TourCoverImages.MaxBytes);
    }
}
