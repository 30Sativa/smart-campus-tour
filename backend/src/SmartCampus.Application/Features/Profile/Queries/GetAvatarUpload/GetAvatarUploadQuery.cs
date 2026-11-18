using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FallbackVideo;

namespace SmartCampus.Application.Features.Profile.Queries.GetAvatarUpload;

/// <summary>
/// What the profile page needs to send one new avatar straight to Cloudinary (ADR-0064): POST the file with every field
/// of <see cref="Fields"/> to <see cref="UploadUrl"/>, then save <see cref="StoredUrl"/> with <c>PUT me/avatar</c>.
/// </summary>
public sealed record AvatarUploadTicket(string UploadUrl, IReadOnlyDictionary<string, string> Fields, string StoredUrl, long MaxBytes);

/// <summary>The subject always comes from the token; the public ID is under that account's own folder.</summary>
public sealed record GetAvatarUploadQuery(Guid UserId) : IQuery<AvatarUploadTicket>, IAccountTransactionRequest;

public sealed class GetAvatarUploadQueryHandler(IAccountRepository accountRepository, CloudinarySettings settings, TimeProvider clock)
    : IRequestHandler<GetAvatarUploadQuery, AvatarUploadTicket>
{
    public const string Unavailable = "AVATAR_UPLOAD_UNAVAILABLE";

    public async Task<AvatarUploadTicket> Handle(GetAvatarUploadQuery request, CancellationToken cancellationToken)
    {
        var user = await accountRepository.FindForManagementAsync(request.UserId, cancellationToken)
            ?? throw new UnauthorizedException("A valid account identity is required.");
        ProfileRules.EnsureUsable(user);
        if (!settings.Enabled)
            throw new ServiceUnavailableException("Máy chủ chưa cấu hình Cloudinary nên chưa tải được ảnh đại diện.", Unavailable);

        var publicId = AvatarAssets.PublicIdFor(user.Id, Guid.NewGuid());
        return new AvatarUploadTicket(
            $"https://api.cloudinary.com/v1_1/{settings.CloudName}/image/upload",
            AvatarAssets.UploadFields(settings, publicId, clock.GetUtcNow()),
            AvatarAssets.StoredUrl(settings.CloudName!, publicId),
            AvatarAssets.MaxBytes);
    }
}
