using System.Net;
using Microsoft.Extensions.Configuration;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Infrastructure.Authentication.Jwt;

namespace SmartCampus.IntegrationTests;

public sealed class RouteManagementEndpointTests
{
    [Fact]
    public async Task LegacyRouteCatalogWritesAndAdminAliasAreNotRouted()
    {
        const string unusedDatabase = "Server=127.0.0.1,1;Database=Unused;User ID=unused;Password=unused;TrustServerCertificate=true;Connect Timeout=1";
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(unusedDatabase);
        var staffToken = new JwtAuthTokenService(new JwtTokenSettings(new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["Authentication:Jwt:SigningKey"] = InitialAdminSeederTests.TestJwtSigningKey }).Build()))
            .IssueAccessToken(Guid.NewGuid(), ApplicationRoles.Staff, DateTimeOffset.UtcNow);
        foreach (var (method, path, expectedStatus) in new[]
        {
            (HttpMethod.Get, "/api/admin/routes", HttpStatusCode.NotFound),
            (HttpMethod.Post, "/api/admin/routes", HttpStatusCode.NotFound),
            (HttpMethod.Get, "/api/admin/routes/00000000-0000-0000-0000-000000000001", HttpStatusCode.NotFound),
            (HttpMethod.Post, "/api/staff/manage/routes", HttpStatusCode.MethodNotAllowed),
            (HttpMethod.Put, "/api/staff/manage/routes/00000000-0000-0000-0000-000000000001", HttpStatusCode.MethodNotAllowed),
            (HttpMethod.Delete, "/api/staff/manage/routes/00000000-0000-0000-0000-000000000001", HttpStatusCode.MethodNotAllowed),
            (HttpMethod.Post, "/api/staff/manage/routes/00000000-0000-0000-0000-000000000001/activate", HttpStatusCode.NotFound),
            (HttpMethod.Post, "/api/staff/manage/routes/00000000-0000-0000-0000-000000000001/deactivate", HttpStatusCode.NotFound)
        })
        {
            using var request = new HttpRequestMessage(method, path);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", staffToken);
            using var response = await host.Client.SendAsync(request);
            Assert.Equal(expectedStatus, response.StatusCode);
        }
        using var read = await host.Client.GetAsync("/api/staff/manage/routes");
        Assert.Equal(HttpStatusCode.Unauthorized, read.StatusCode);
    }
}
