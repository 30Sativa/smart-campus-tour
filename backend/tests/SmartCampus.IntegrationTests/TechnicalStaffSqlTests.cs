using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace SmartCampus.IntegrationTests;

public sealed class TechnicalStaffSqlTests
{
    [SchemaV11Fact]
    public async Task AdminCanCreateListAndManageTechnicalStaff_AndSessionsUseCanonicalRole()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "technical.admin", roles: ["ADMIN"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        using var adminLogin = await Login(host.Client, "technical.admin");
        Assert.Equal(HttpStatusCode.OK, adminLogin.StatusCode);
        var adminToken = (await Body(adminLogin)).GetProperty("accessToken").GetString()!;
        using var create = Request(HttpMethod.Post, "/api/admin/accounts", adminToken);
        create.Content = JsonContent.Create(new { username = "technical.user", fullName = "Technical User",
            role = "TechnicalStaff", initialPassword = InitialAdminSeederTests.Password });
        using var created = await host.Client.SendAsync(create);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var data = (await Body(created)).GetProperty("data");
        var id = data.GetProperty("id").GetGuid();
        Assert.Equal("TechnicalStaff", data.GetProperty("role").GetString());
        Assert.Equal("TECHNICAL_STAFF", await database.GetOnlyRoleAsync(id));

        using var listRequest = Request(HttpMethod.Get, "/api/admin/accounts?search=technical.user", adminToken);
        using var list = await host.Client.SendAsync(listRequest);
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Equal("TechnicalStaff", Assert.Single((await Body(list)).GetProperty("data").EnumerateArray())
            .GetProperty("role").GetString());
        using var login = await Login(host.Client, "technical.user");
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var body = await Body(login);
        Assert.Equal("TechnicalStaff", body.GetProperty("role").GetString());
        TechnicalStaffAccountTests.AssertClaim(body.GetProperty("accessToken").GetString()!, "TechnicalStaff");
        var cookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        using var refreshRequest = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
        refreshRequest.Headers.Add("Cookie", cookie);
        using var refresh = await host.Client.SendAsync(refreshRequest);
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        var refreshed = await Body(refresh);
        Assert.Equal("TechnicalStaff", refreshed.GetProperty("role").GetString());
        TechnicalStaffAccountTests.AssertClaim(refreshed.GetProperty("accessToken").GetString()!, "TechnicalStaff");

        using var deactivate = Request(HttpMethod.Post, $"/api/admin/accounts/{id}/deactivate", adminToken);
        using var deactivated = await host.Client.SendAsync(deactivate);
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        using var lockedLogin = await Login(host.Client, "technical.user");
        Assert.Equal(HttpStatusCode.Forbidden, lockedLogin.StatusCode);
        using var revokedRefresh = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
        revokedRefresh.Headers.Add("Cookie", cookie);
        using var revoked = await host.Client.SendAsync(revokedRefresh);
        Assert.Equal(HttpStatusCode.Unauthorized, revoked.StatusCode);
        using var reactivate = Request(HttpMethod.Post, $"/api/admin/accounts/{id}/reactivate", adminToken);
        using var reactivated = await host.Client.SendAsync(reactivate);
        Assert.Equal(HttpStatusCode.OK, reactivated.StatusCode);
        using var activeLogin = await Login(host.Client, "technical.user");
        Assert.Equal(HttpStatusCode.OK, activeLogin.StatusCode);
    }

    [SchemaV11Fact]
    public async Task SqlLoginRejectsMixedTechnicalAndUnknownRoles()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "technical.mixed", roles: ["TECHNICAL_STAFF", "STAFF"]);
        await database.InsertUserAsync(true, username: "technical.unknown", roles: ["UNKNOWN"]);
        await database.InsertUserAsync(false, username: "technical.locked", roles: ["TECHNICAL_STAFF"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        foreach (var username in new[] { "technical.mixed", "technical.unknown", "technical.locked" })
        {
            using var response = await Login(host.Client, username);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.False(response.Headers.Contains("Set-Cookie"));
        }
        Assert.Equal(0, await database.CountRowsAsync("dbo.RefreshTokens"));
    }

    private static Task<HttpResponseMessage> Login(HttpClient client, string username) =>
        client.PostAsJsonAsync("/api/auth/login", new { username, password = InitialAdminSeederTests.Password });
    private static HttpRequestMessage Request(HttpMethod method, string path, string token)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }
    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.Clone();
    }
}
