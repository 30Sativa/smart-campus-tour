using System.Text.Json.Serialization;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FallbackVideo;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Profile.Commands.SetMyAvatar;

/// <summary><c>avatarUrl</c>: the <c>storedUrl</c> of this account's own upload, or null to remove the picture.</summary>
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SetMyAvatarRequest(string? AvatarUrl);

public sealed record SetMyAvatarCommand(Guid UserId, SetMyAvatarRequest Request)
    : ICommand<AccountProfileResponse>, IAccountTransactionRequest;

public sealed class SetMyAvatarCommandValidator : AbstractValidator<SetMyAvatarCommand>
{
    public SetMyAvatarCommandValidator()
    {
        RuleFor(command => command.UserId).NotEmpty();
        RuleFor(command => command.Request).NotNull();
        When(command => command.Request is not null, () =>
            RuleFor(command => command.Request.AvatarUrl)
                .MaximumLength(1000)
                .OverridePropertyName(nameof(SetMyAvatarRequest.AvatarUrl)));
    }
}

/// <summary>
/// ADR-0064: only a picture this account uploaded through its own signed ticket can become its avatar, so nobody can
/// point an avatar at another account's picture or at any other address. The old picture stays on Cloudinary.
/// </summary>
public sealed class SetMyAvatarCommandHandler(
    IAccountRepository accountRepository,
    CloudinarySettings settings,
    TimeProvider timeProvider)
    : IRequestHandler<SetMyAvatarCommand, AccountProfileResponse>
{
    public async Task<AccountProfileResponse> Handle(SetMyAvatarCommand request, CancellationToken cancellationToken)
    {
        var user = await accountRepository.FindForManagementAsync(request.UserId, cancellationToken)
            ?? throw new UnauthorizedException("A valid account identity is required.");
        var role = ProfileRules.EnsureUsable(user);

        var avatarUrl = string.IsNullOrWhiteSpace(request.Request.AvatarUrl) ? null : request.Request.AvatarUrl.Trim();
        if (avatarUrl is not null && (!settings.Enabled || !AvatarAssets.IsOwnUpload(settings.CloudName!, user.Id, avatarUrl)))
            throw new ValidationException([new ValidationFailure(nameof(SetMyAvatarRequest.AvatarUrl),
                "Ảnh đại diện phải là ảnh vừa tải lên từ chính tài khoản này.")]);

        if (avatarUrl != user.AvatarUrl)
        {
            var now = timeProvider.GetUtcNow();
            user.AvatarUrl = avatarUrl;
            user.UpdatedAt = now;
            accountRepository.AddAuditLog(new AuditLog
            {
                ActorUserId = user.Id,
                Action = avatarUrl is null ? "AVATAR_REMOVED" : "AVATAR_UPDATED",
                EntityType = "User",
                EntityId = user.Id.ToString("D"),
                OccurredAt = now
            });
        }

        return ProfileRules.ToResponse(user, role);
    }
}
