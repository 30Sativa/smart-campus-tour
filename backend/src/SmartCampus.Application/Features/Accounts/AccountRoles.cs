using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Accounts;

/// <summary>Role management policy specific to Admin Account Management.</summary>
internal static class AccountRoles
{
    internal static bool IsCreatable(string? role) =>
        string.Equals(role, ApplicationRoles.Staff, StringComparison.OrdinalIgnoreCase)
        || string.Equals(role, ApplicationRoles.Representative, StringComparison.OrdinalIgnoreCase);

    internal static string ToStoredCreatableRole(string role)
    {
        if (string.Equals(role, ApplicationRoles.Staff, StringComparison.OrdinalIgnoreCase))
            return ApplicationRoles.StaffCode;
        if (string.Equals(role, ApplicationRoles.Representative, StringComparison.OrdinalIgnoreCase))
            return ApplicationRoles.RepresentativeCode;
        throw new ForbiddenException("Only Staff and Representative accounts can be managed.");
    }

    internal static void EnsureManaged(IEnumerable<string> assignedRoles)
    {
        var role = ApplicationRoles.Resolve(assignedRoles);
        if (role == ApplicationRoles.Admin)
            throw new ForbiddenException("Admin accounts cannot be managed through this API.");
    }
}
