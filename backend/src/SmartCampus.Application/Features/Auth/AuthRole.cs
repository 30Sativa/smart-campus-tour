using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Auth;

internal static class AuthRole
{
    public static string Resolve(IEnumerable<string> assignedRoles)
    {
        var roles = assignedRoles.Distinct(StringComparer.Ordinal).ToArray();
        if (roles.Length != 1)
            throw new ForbiddenException("Account is not configured for system access.");

        return roles[0].ToUpperInvariant() switch
        {
            "ADMIN" => "Admin",
            "STAFF" => "Staff",
            "SCHOOL_REPRESENTATIVE" => "Representative",
            _ => throw new ForbiddenException("Account is not configured for system access.")
        };
    }
}
