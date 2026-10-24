using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class AuthHardeningEndpointTests
{
    [SchemaV11Fact]
    public async Task CookieAuth_RejectsUntrustedOriginsBeforeClearingOrRevoking_AndAllowsTrustedOrigin()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "origin.staff", roles: ["STAFF"]);
        const string trusted = "https://tour.example.test";
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString,
            new Dictionary<string, string> { ["Cors__AllowedOrigins__0"] = trusted });
        using var login = await host.Client.PostAsJsonAsync("/api/auth/login",
            new { username = "origin.staff", password = InitialAdminSeederTests.Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        foreach (var path in new[] { "refresh", "logout" })
        foreach (var origin in new[] { "https://untrusted.example", "null", trusted + ".evil.example" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/" + path)
            { Content = new StringContent("", System.Text.Encoding.UTF8, "application/x-www-form-urlencoded") };
            request.Headers.Add("Origin", origin);
            request.Headers.Add("Cookie", cookie);
            using var denied = await host.Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
            Assert.False(denied.Headers.Contains("Set-Cookie"));
        }
        using (var noOrigin = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout"))
        {
            noOrigin.Headers.Add("Cookie", cookie);
            noOrigin.Headers.Add("Sec-Fetch-Site", "same-site");
            using var denied = await host.Client.SendAsync(noOrigin);
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        }
        await using (var db = Context(database.ConnectionString)) Assert.Null((await db.RefreshTokens.SingleAsync()).RevokedAt);
        using var allowed = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout");
        allowed.Headers.Add("Origin", trusted);
        allowed.Headers.Add("Cookie", cookie);
        using var response = await host.Client.SendAsync(allowed);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await using (var db = Context(database.ConnectionString)) Assert.NotNull((await db.RefreshTokens.SingleAsync()).RevokedAt);
    }

    [SchemaV11Fact]
    public async Task Login_BudgetsBothAccountAndIp_AndReturnsRateLimitEnvelope()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        for (var i = 0; i < 10; i++)
        {
            using var failure = await host.Client.PostAsJsonAsync("/api/auth/login", new { username = "unknown", password = "x" });
            Assert.Equal(HttpStatusCode.Unauthorized, failure.StatusCode);
        }
        using (var accountLimited = await host.Client.PostAsJsonAsync("/api/auth/login", new { username = "UNKNOWN", password = "x" }))
        {
            Assert.Equal(HttpStatusCode.TooManyRequests, accountLimited.StatusCode);
            using var json = JsonDocument.Parse(await accountLimited.Content.ReadAsStringAsync());
            Assert.Equal("RATE_LIMITED", json.RootElement.GetProperty("errors").GetProperty("code").GetString());
        }
        for (var i = 0; i < 19; i++)
        {
            using var failure = await host.Client.PostAsJsonAsync("/api/auth/login", new { username = "unknown" + i, password = "x" });
            Assert.Equal(HttpStatusCode.Unauthorized, failure.StatusCode);
        }
        using var ipLimited = await host.Client.PostAsJsonAsync("/api/auth/login", new { username = "another", password = "x" });
        Assert.Equal(HttpStatusCode.TooManyRequests, ipLimited.StatusCode);
        using var body = JsonDocument.Parse(await ipLimited.Content.ReadAsStringAsync());
        Assert.Equal("RATE_LIMITED", body.RootElement.GetProperty("errors").GetProperty("code").GetString());
    }

    [SchemaV11Fact]
    public async Task MalformedStudentTurns_ReturnValidationEnvelope_WithoutCallingAssistant()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await using var assistant = new FakeAssistantServer();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString,
            new Dictionary<string, string> { ["AiAssistant__BaseUrl"] = assistant.BaseUrl, ["AiAssistant__ServiceKey"] = "test-only-service-key" });
        using var response = await host.Client.PostAsJsonAsync($"/api/student/tours/{Guid.NewGuid()}/questions",
            new { questionId = Guid.NewGuid(), text = "test", recentTurns = new object?[] { null } });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(json.RootElement.GetProperty("success").GetBoolean());
        Assert.Empty(assistant.Requests);
    }

    private static ApplicationDbContext Context(string cs) => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(cs).Options);
}
