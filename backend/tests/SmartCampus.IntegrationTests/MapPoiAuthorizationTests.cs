using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using SmartCampus.Api.Controllers;
using SmartCampus.Application.Common.Authentication;

namespace SmartCampus.IntegrationTests;

public sealed class MapPoiAuthorizationTests
{
    [Theory]
    [InlineData(nameof(MapPoiController.UploadMap), ApplicationRoles.TechnicalStaff)]
    [InlineData(nameof(MapPoiController.RecordDeployment), ApplicationRoles.TechnicalStaff)]
    [InlineData(nameof(MapPoiController.ListDeploymentChecks), ApplicationRoles.TechnicalStaff)]
    [InlineData(nameof(MapPoiController.VerificationQueue), ApplicationRoles.TechnicalStaff)]
    [InlineData(nameof(MapPoiController.RecordVerification), ApplicationRoles.TechnicalStaff)]
    [InlineData(nameof(MapPoiController.CreateProposal), ApplicationRoles.Staff)]
    [InlineData(nameof(MapPoiController.ReviseProposal), ApplicationRoles.Staff)]
    [InlineData(nameof(MapPoiController.SubmitProposal), ApplicationRoles.Staff)]
    public void MutationsHaveServerEnforcedSingleRolePolicy(string methodName, string allowedRole)
    {
        var method = typeof(MapPoiController).GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public)!;
        var policy = method.GetCustomAttribute<AuthorizeAttribute>();
        Assert.NotNull(policy);
        Assert.Equal(allowedRole, policy!.Roles);
        Assert.DoesNotContain(ApplicationRoles.Admin, policy.Roles, StringComparison.Ordinal);
    }

    [Fact]
    public void SharedReadEndpointsAllowOnlyStaffAndTechnicalStaff()
    {
        foreach (var name in new[] { nameof(MapPoiController.ListMaps), nameof(MapPoiController.GetMap),
                     nameof(MapPoiController.DownloadMap), nameof(MapPoiController.ListProposals),
                     nameof(MapPoiController.GetProposal), nameof(MapPoiController.GetProposalHistory) })
        {
            var method = typeof(MapPoiController).GetMethod(name, BindingFlags.Instance | BindingFlags.Public)!;
            var roles = method.GetCustomAttribute<AuthorizeAttribute>()?.Roles;
            Assert.Equal("Staff,TechnicalStaff", roles);
            Assert.DoesNotContain(ApplicationRoles.Admin, roles, StringComparison.Ordinal);
        }
    }
}
