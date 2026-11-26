using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FallbackVideo;

namespace SmartCampus.Application.Features.TechnicalEvidence;

/// <summary>
/// What a Technical page needs to send one evidence photo straight to Cloudinary (ADR-0072): POST the file with every
/// field of <see cref="Fields"/> to <see cref="UploadUrl"/>, then send <see cref="StoredUrl"/> in the record's
/// <c>evidencePhotoUrls</c>. The photo never passes through the API.
/// </summary>
public sealed record EvidencePhotoUploadTicket(string UploadUrl, IReadOnlyDictionary<string, string> Fields, string StoredUrl,
    long MaxBytes, int MaxPhotos);

/// <summary>The subject always comes from the token; the public ID is under that account's own folder.</summary>
public sealed record GetEvidencePhotoUploadQuery(Guid UserId) : IQuery<EvidencePhotoUploadTicket>;

public sealed class GetEvidencePhotoUploadQueryHandler(CloudinarySettings settings, TimeProvider clock)
    : IRequestHandler<GetEvidencePhotoUploadQuery, EvidencePhotoUploadTicket>
{
    public const string Unavailable = "EVIDENCE_PHOTO_UPLOAD_UNAVAILABLE";

    public Task<EvidencePhotoUploadTicket> Handle(GetEvidencePhotoUploadQuery request, CancellationToken cancellationToken)
    {
        if (!settings.Enabled)
            throw new ServiceUnavailableException("Máy chủ chưa cấu hình Cloudinary nên chưa tải được ảnh bằng chứng.", Unavailable);
        var publicId = TechnicalEvidencePhotos.PublicIdFor(request.UserId, Guid.NewGuid());
        return Task.FromResult(new EvidencePhotoUploadTicket(
            $"https://api.cloudinary.com/v1_1/{settings.CloudName}/image/upload",
            TechnicalEvidencePhotos.UploadFields(settings, publicId, clock.GetUtcNow()),
            TechnicalEvidencePhotos.StoredUrl(settings.CloudName!, publicId),
            TechnicalEvidencePhotos.MaxBytes,
            TechnicalEvidencePhotos.MaxPhotos));
    }
}
