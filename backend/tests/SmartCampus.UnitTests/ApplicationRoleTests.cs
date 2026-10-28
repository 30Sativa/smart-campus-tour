using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.UnitTests;

public sealed class ApplicationRoleTests
{
    [Theory]
    [InlineData("ADMIN", "Admin")]
    [InlineData("STAFF", "Staff")]
    [InlineData("SCHOOL_REPRESENTATIVE", "Representative")]
    [InlineData("TECHNICAL_STAFF", "TechnicalStaff")]
    [InlineData("technical_staff", "TechnicalStaff")]
    public void SupportedSingleRole_ResolvesToCanonicalClaim(string stored, string expected) =>
        Assert.Equal(expected, ApplicationRoles.Resolve([stored]));

    [Theory]
    [InlineData("")]
    [InlineData("VIEWER")]
    [InlineData("OPERATOR")]
    [InlineData("VISITOR")]
    [InlineData("TECHNICAL_STAFF,STAFF")]
    [InlineData("TECHNICAL_STAFF,ADMIN")]
    [InlineData("TECHNICAL_STAFF,SCHOOL_REPRESENTATIVE")]
    [InlineData("TECHNICAL_STAFF,UNKNOWN")]
    public void InvalidAssignment_FailsClosed(string roles)
    {
        var assigned = roles.Length == 0 ? [] : roles.Split(',');
        Assert.False(ApplicationRoles.TryResolve(assigned, out var role));
        Assert.Null(role);
        Assert.Throws<ForbiddenException>(() => ApplicationRoles.Resolve(assigned));
    }
}
