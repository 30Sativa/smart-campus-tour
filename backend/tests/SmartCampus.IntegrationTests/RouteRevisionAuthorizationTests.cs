using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using SmartCampus.Api.Controllers;
using SmartCampus.Application.Common.Authentication;

namespace SmartCampus.IntegrationTests;

public sealed class RouteRevisionAuthorizationTests
{
    [Theory]
    [InlineData(nameof(RouteRevisionsController.Create), ApplicationRoles.Staff)]
    [InlineData(nameof(RouteRevisionsController.Revise), ApplicationRoles.Staff)]
    [InlineData(nameof(RouteRevisionsController.Submit), ApplicationRoles.Staff)]
    [InlineData(nameof(RouteRevisionsController.Queue), ApplicationRoles.TechnicalStaff)]
    [InlineData(nameof(RouteRevisionsController.RecordRun), ApplicationRoles.TechnicalStaff)]
    public void MutationsUseTheRequiredSingleRole(string methodName, string expectedRole)
    {
        var method = typeof(RouteRevisionsController).GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public)!;
        Assert.Equal(expectedRole, method.GetCustomAttribute<AuthorizeAttribute>()?.Roles);
        Assert.DoesNotContain(ApplicationRoles.Admin, expectedRole, StringComparison.Ordinal);
    }

    [Fact]
    public void RouteHistoryAllowsOnlyStaffAndTechnicalStaff()
    {
        var method = typeof(RouteRevisionsController).GetMethod(nameof(RouteRevisionsController.History), BindingFlags.Instance | BindingFlags.Public)!;
        Assert.Equal($"{ApplicationRoles.Staff},{ApplicationRoles.TechnicalStaff}", method.GetCustomAttribute<AuthorizeAttribute>()?.Roles);
        Assert.DoesNotContain(ApplicationRoles.Admin, method.GetCustomAttribute<AuthorizeAttribute>()!.Roles, StringComparison.Ordinal);
    }
}
