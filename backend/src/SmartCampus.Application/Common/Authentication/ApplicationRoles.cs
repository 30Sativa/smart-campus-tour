using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Common.Authentication;

/// <summary>Shared persisted-role and application-role contract.</summary>
public static class ApplicationRoles
{
    public const string Admin = "Admin";
    public const string Staff = "Staff";
    public const string Representative = "Representative";

    public const string AdminCode = "ADMIN";
    public const string StaffCode = "STAFF";
    public const string RepresentativeCode = "SCHOOL_REPRESENTATIVE";

    public static string Resolve(IEnumerable<string> assignedRoles)
    {
        if (TryResolve(assignedRoles, out var role))
            return role!;

        throw new ForbiddenException("Account is not configured for system access.");
    }

    public static bool TryResolve(IEnumerable<string> assignedRoles, out string? role)
    {
        var roles = assignedRoles.Distinct(StringComparer.Ordinal).ToArray();
        if (roles.Length != 1)
        {
            role = null;
            return false;
        }

        role = roles[0].ToUpperInvariant() switch
        {
            AdminCode => Admin,
            StaffCode => Staff,
            RepresentativeCode => Representative,
            _ => null
        };

        return role is not null;
    }

}
