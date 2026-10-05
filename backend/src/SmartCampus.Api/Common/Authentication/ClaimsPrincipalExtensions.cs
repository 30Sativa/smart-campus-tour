using System.Security.Claims;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Api.Common.Authentication;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetRequiredUserId(this ClaimsPrincipal user)
    {
        var subject = user.FindFirstValue("sub");
        if (!Guid.TryParse(subject, out var userId))
            throw new UnauthorizedException("A valid account identity is required.");
        return userId;
    }
}
