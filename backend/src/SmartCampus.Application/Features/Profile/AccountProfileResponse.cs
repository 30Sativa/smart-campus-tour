using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Profile;

/// <summary>Self-service view of an account. Never contains credentials or token data.</summary>
public sealed record AccountProfileResponse(
    Guid Id,
    string Username,
    string FullName,
    string Role,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt);

internal static class ProfileRules
{
    public const int FullNameMaxLength = 150;

    /// <summary>The JWT outlives deactivation, so every self-service call rechecks the stored account.</summary>
    internal static string EnsureUsable(User user)
    {
        if (!user.IsActive)
            throw new ForbiddenException("Account cannot access the system.");
        return ApplicationRoles.Resolve(user.UserRoles.Select(userRole => userRole.Role));
    }

    internal static AccountProfileResponse ToResponse(User user, string role) => new(
        user.Id, user.Username, user.FullName, role, user.IsActive, user.CreatedAt, user.UpdatedAt);
}
