using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using SmartCampus.Api.Controllers;
using SmartCampus.Api.Hubs;
using SmartCampus.Application.Common.Authentication;

namespace SmartCampus.IntegrationTests;

public sealed class MonitoringAuthorizationTests
{
    [Fact]
    public void AdminInfrastructureController_IsRestrictedToAdminRoleOnly()
    {
        var controllerType = typeof(AdminInfrastructureController);
        var authAttr = controllerType.GetCustomAttribute<AuthorizeAttribute>();

        Assert.NotNull(authAttr);
        Assert.Equal(ApplicationRoles.Admin, authAttr!.Roles);
        Assert.DoesNotContain(ApplicationRoles.TechnicalStaff, authAttr.Roles, StringComparison.Ordinal);
        Assert.DoesNotContain(ApplicationRoles.Staff, authAttr.Roles, StringComparison.Ordinal);
        Assert.DoesNotContain(ApplicationRoles.Representative, authAttr.Roles, StringComparison.Ordinal);
    }

    [Fact]
    public void TechnicalDashboardController_IsRestrictedToTechnicalStaffRoleOnly()
    {
        var controllerType = typeof(TechnicalDashboardController);
        var authAttr = controllerType.GetCustomAttribute<AuthorizeAttribute>();

        Assert.NotNull(authAttr);
        Assert.NotNull(authAttr.Roles);
        var roles = authAttr.Roles.Split(',', StringSplitOptions.TrimEntries);
        Assert.Contains(ApplicationRoles.TechnicalStaff, roles);
        Assert.DoesNotContain(ApplicationRoles.Admin, roles);
        Assert.DoesNotContain(ApplicationRoles.Staff, roles);
        Assert.DoesNotContain(ApplicationRoles.Representative, roles);

        var methods = new[]
        {
            nameof(TechnicalDashboardController.GetDashboard),
            nameof(TechnicalDashboardController.GetRobotDiagnostics)
        };

        foreach (var methodName in methods)
        {
            var method = controllerType.GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public);
            Assert.NotNull(method);
        }
    }

    [Fact]
    public void FleetDiagnosticsController_RequiresFleetRobotAuthenticationScheme()
    {
        var controllerType = typeof(FleetDiagnosticsController);
        var authAttr = controllerType.GetCustomAttribute<AuthorizeAttribute>();

        Assert.NotNull(authAttr);
        Assert.Equal(FleetRobotAuthentication.Scheme, authAttr!.AuthenticationSchemes);
    }
}
