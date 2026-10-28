using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace SmartCampus.IntegrationTests;

// None of these requests reach SQL: documentation, the health probe and JWT
// rejection all complete before a controller resolves the database.
public sealed class ApiDocumentationEndpointTests
{
    private const string UnusedDatabase =
        "Server=127.0.0.1,1;Database=ApiDocumentationDoesNotConnect;User ID=unused;Password=unused;TrustServerCertificate=true;Connect Timeout=1";
    private const string Username = "docs-reviewer";
    private const string DocsPassword = "test-only-docs-password-0001";

    [Fact]
    public async Task Production_DoesNotServeDocumentationByDefault()
    {
        await using var host = await StartAsync("Production");
        foreach (var path in new[] { "/swagger", "/swagger/index.html", "/openapi/v1.json" })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, path);
            request.Headers.Authorization = Basic(Username, DocsPassword);
            using var response = await host.Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
    }

    [Fact]
    public async Task Production_ExplicitFalseKeepsDocumentationOff_EvenWithCredential()
    {
        await using var host = await StartAsync("Production", Enabled(false));
        using var request = new HttpRequestMessage(HttpMethod.Get, "/openapi/v1.json");
        request.Headers.Authorization = Basic(Username, DocsPassword);
        using var response = await host.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Production_ServesDocumentationOnlyWithItsCredential()
    {
        await using var host = await StartAsync("Production", Enabled(true));
        foreach (var path in new[] { "/swagger/index.html", "/openapi/v1.json" })
        {
            using var anonymous = await host.Client.GetAsync(path);
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
            Assert.Equal("Basic", anonymous.Headers.WwwAuthenticate.Single().Scheme);
            foreach (var wrong in new[] { Basic(Username, DocsPassword + "x"), Basic("other", DocsPassword),
                         new AuthenticationHeaderValue("Basic", "not-base64!"), new AuthenticationHeaderValue("Bearer", DocsPassword) })
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, path);
                request.Headers.Authorization = wrong;
                using var rejected = await host.Client.SendAsync(request);
                Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
            }
        }

        using (var ui = await GetWithCredentialAsync(host, "/swagger/index.html"))
        {
            Assert.Equal(HttpStatusCode.OK, ui.StatusCode);
            Assert.Equal("text/html", ui.Content.Headers.ContentType?.MediaType);
        }
        using (var config = await GetWithCredentialAsync(host, "/swagger/index.js"))
        {
            Assert.Equal(HttpStatusCode.OK, config.StatusCode);
            Assert.Contains("/openapi/v1.json", await config.Content.ReadAsStringAsync());
        }

        using var document = await GetWithCredentialAsync(host, "/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, document.StatusCode);
        using var json = JsonDocument.Parse(await document.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.StartsWith("3.", root.GetProperty("openapi").GetString());
        var paths = root.GetProperty("paths");
        Assert.Equal("[Admin] Liệt kê và tìm tài khoản", paths.GetProperty("/api/admin/accounts").GetProperty("get").GetProperty("summary").GetString());
        foreach (var path in new[] { "/api/auth/login", "/api/admin/accounts", "/api/representative/tours", "/health/ready" })
            Assert.True(paths.TryGetProperty(path, out _), $"OpenAPI document is missing {path}.");
        Assert.False(paths.TryGetProperty("/api/simulation/pose", out _));

        foreach (var path in paths.EnumerateObject())
        foreach (var method in path.Value.EnumerateObject().Where(property =>
                     property.Name is "get" or "post" or "put" or "patch" or "delete" or "head" or "options" or "trace"))
        {
            var operation = method.Value;
            Assert.True(operation.TryGetProperty("summary", out var summary), $"Missing summary: {method.Name} {path.Name}");
            Assert.False(string.IsNullOrWhiteSpace(summary.GetString()), $"Empty summary: {method.Name} {path.Name}");
            Assert.True(operation.TryGetProperty("description", out var description), $"Missing description: {method.Name} {path.Name}");
            Assert.False(string.IsNullOrWhiteSpace(description.GetString()), $"Empty description: {method.Name} {path.Name}");
            Assert.NotEmpty(operation.GetProperty("tags").EnumerateArray());
        }

        var upload = paths.GetProperty("/api/technical/map-versions").GetProperty("post");
        Assert.Equal("[Technical Staff] Upload gói ROS map và tạo phiên bản", upload.GetProperty("summary").GetString());
        Assert.Contains("does not deploy", upload.GetProperty("description").GetString(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Technical Staff — Maps", upload.GetProperty("tags")[0].GetString());
        Assert.True(upload.GetProperty("security")[0].TryGetProperty("Bearer", out _));

        var proposal = paths.GetProperty("/api/staff/poi-proposals/{id}/submit").GetProperty("post");
        Assert.Equal("Tour Staff — POI Proposals", proposal.GetProperty("tags")[0].GetString());
        Assert.Contains("does not mean the POI has passed", proposal.GetProperty("description").GetString(), StringComparison.Ordinal);

        var verification = paths.GetProperty("/api/technical/poi-proposals/{id}/revisions/{revisionNumber}/verification").GetProperty("post");
        Assert.Equal("Technical Staff — POI Verification", verification.GetProperty("tags")[0].GetString());
        Assert.Contains("navigation fingerprint", verification.GetProperty("description").GetString(), StringComparison.Ordinal);

        foreach (var retired in new[] { "/api/admin/pois", "/api/staff/manage/pois", "/api/admin/routes",
                     "/api/admin/tours", "/api/admin/registrations", "/api/admin/registrations/{id}/roster/{rowId}/email",
                     "/api/staff/manage/registrations/{id}/approve", "/api/staff/manage/registrations/{id}/reject" })
            Assert.False(paths.TryGetProperty(retired, out _), $"Retired endpoint remains in OpenAPI: {retired}");
        Assert.True(paths.TryGetProperty("/api/staff/poi-proposals", out _));
        Assert.True(paths.TryGetProperty("/api/staff/manage/registrations/{id}/rows/{rowId}/accept", out _));
        Assert.True(paths.TryGetProperty("/api/admin/accounts", out _));

        var bearer = root.GetProperty("components").GetProperty("securitySchemes").GetProperty("Bearer");
        Assert.Equal("http", bearer.GetProperty("type").GetString());
        Assert.Equal("bearer", bearer.GetProperty("scheme").GetString());
        Assert.True(paths.GetProperty("/api/admin/accounts").GetProperty("get").GetProperty("security")[0].TryGetProperty("Bearer", out _));
        Assert.False(paths.GetProperty("/api/auth/login").GetProperty("post").TryGetProperty("security", out _));
        Assert.False(paths.GetProperty("/api/fleet/v1/sync").GetProperty("post").TryGetProperty("security", out _));
        Assert.DoesNotContain(DocsPassword, root.GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Production_DocumentationCredentialGrantsNoApiAccess_AndLeavesHealthAnonymous()
    {
        await using var host = await StartAsync("Production", Enabled(true));
        using (var live = await host.Client.GetAsync("/health/live"))
            Assert.Equal(HttpStatusCode.NoContent, live.StatusCode);
        using (var anonymous = await host.Client.GetAsync("/api/admin/accounts"))
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        using var withDocsCredential = await GetWithCredentialAsync(host, "/api/admin/accounts");
        Assert.Equal(HttpStatusCode.Unauthorized, withDocsCredential.StatusCode);
        Assert.Equal("Bearer", withDocsCredential.Headers.WwwAuthenticate.Single().Scheme);
    }

    [Theory]
    [InlineData(null, null, "are required to enable API documentation outside Development")]
    [InlineData(Username, "short-password", "at least 16 characters")]
    [InlineData("bad:name", DocsPassword, "must not contain ':'")]
    public async Task Production_RefusesUnsafeDocumentationConfiguration(string? username, string? password, string expected)
    {
        var settings = new Dictionary<string, string> { ["ApiDocumentation__Enabled"] = "true" };
        if (username is not null) settings["ApiDocumentation__Username"] = username;
        if (password is not null) settings["ApiDocumentation__Password"] = password;
        using var process = InitialAdminSeederTests.StartApiProcess(UnusedDatabase, [],
            environment: "Production", additionalSettings: WithDefaults(settings));
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            throw new TimeoutException("API started despite unsafe documentation configuration.");
        }

        var text = await output + await error;
        Assert.NotEqual(0, process.ExitCode);
        Assert.Contains(expected, text, StringComparison.Ordinal);
        Assert.DoesNotContain("Now listening on", text, StringComparison.OrdinalIgnoreCase);
        if (password is not null) Assert.DoesNotContain(password, text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Development_ServesDocumentationWithoutCredential_UnlessDisabled()
    {
        await using (var host = await StartAsync("Development"))
        {
            using var document = await host.Client.GetAsync("/openapi/v1.json");
            Assert.Equal(HttpStatusCode.OK, document.StatusCode);
            using var ui = await host.Client.GetAsync("/swagger/index.html");
            Assert.Equal(HttpStatusCode.OK, ui.StatusCode);
        }

        await using (var host = await StartAsync("Development", new Dictionary<string, string> { ["ApiDocumentation__Enabled"] = "false" }))
        {
            using var document = await host.Client.GetAsync("/openapi/v1.json");
            Assert.Equal(HttpStatusCode.NotFound, document.StatusCode);
        }
    }

    private static Dictionary<string, string> Enabled(bool enabled) => new()
    {
        ["ApiDocumentation__Enabled"] = enabled ? "true" : "false",
        ["ApiDocumentation__Username"] = Username,
        ["ApiDocumentation__Password"] = DocsPassword
    };

    // No SQL is reachable, so the invitation worker must not poll it.
    private static Dictionary<string, string> WithDefaults(Dictionary<string, string>? settings) =>
        new(settings ?? []) { ["Invitations__EmailWorkerEnabled"] = "false" };

    private static Task<PoiManagementEndpointTests.ApiHost> StartAsync(string environment, Dictionary<string, string>? settings = null) =>
        PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(UnusedDatabase, WithDefaults(settings), environment);

    private static AuthenticationHeaderValue Basic(string username, string password) =>
        new("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}")));

    private static Task<HttpResponseMessage> GetWithCredentialAsync(PoiManagementEndpointTests.ApiHost host, string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = Basic(Username, DocsPassword);
        return host.Client.SendAsync(request);
    }
}
