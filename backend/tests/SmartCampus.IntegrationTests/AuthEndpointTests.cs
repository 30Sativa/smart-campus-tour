using System.Diagnostics;
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SmartCampus.Infrastructure.Authentication.Jwt;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Authentication.Seeding;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class AuthEndpointTests
{
    private const string Username = "system.admin";
    private const string Password = "integration-test-password";

    [SchemaV11Fact]
    public async Task LoginRefreshAndLogout_UseHashedRefreshCookieAndSignedShortLivedAccessToken()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var user = await database.InsertUserAsync(isActive: true, addAdminRole: true);
        var port = InitialAdminSeederTests.GetFreePort();
        using var process = InitialAdminSeederTests.StartApiProcess(database.ConnectionString, [], port);
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();

        try
        {
            using var client = new HttpClient
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}"),
                Timeout = TimeSpan.FromSeconds(3)
            };
            await WaitForApiAsync(process, client, standardOutput, standardError);

            using var preflightRequest = new HttpRequestMessage(HttpMethod.Options, "/api/auth/login");
            preflightRequest.Headers.Add("Origin", "http://localhost:5173");
            preflightRequest.Headers.Add("Access-Control-Request-Method", "POST");
            preflightRequest.Headers.Add("Access-Control-Request-Headers", "content-type");
            using var preflight = await client.SendAsync(preflightRequest);
            Assert.Equal(HttpStatusCode.NoContent, preflight.StatusCode);
            Assert.Equal(
                "http://localhost:5173",
                Assert.Single(preflight.Headers.GetValues("Access-Control-Allow-Origin")));
            Assert.Equal(
                "true",
                Assert.Single(preflight.Headers.GetValues("Access-Control-Allow-Credentials")));

            using var invalidLogin = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { username = Username, password = "incorrect-password" });
            Assert.Equal(HttpStatusCode.Unauthorized, invalidLogin.StatusCode);
            Assert.Equal(0, await database.CountRowsAsync("dbo.RefreshTokens"));

            using var missingRefresh = await client.PostAsync("/api/auth/refresh", content: null);
            Assert.Equal(HttpStatusCode.Unauthorized, missingRefresh.StatusCode);
            AssertRefreshCookieCleared(missingRefresh);

            foreach (var username in new[] { " SYSTEM.ADMIN", "SYSTEM.ADMIN ", "SYSTEM ADMIN", "system\tadmin", "system\u00a0admin" })
            {
                using var invalidUsername = await client.PostAsJsonAsync(
                    "/api/auth/login", new { username, password = Password });
                Assert.Equal(HttpStatusCode.BadRequest, invalidUsername.StatusCode);
                Assert.False(invalidUsername.Headers.Contains("Set-Cookie"));
                Assert.Equal(0, await database.CountRowsAsync("dbo.RefreshTokens"));
            }

            using var login = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "SYSTEM.ADMIN", password = Password });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            var loginBody = await login.Content.ReadFromJsonAsync<AuthResponse>();
            Assert.NotNull(loginBody);
            Assert.Equal(user.Id, loginBody.UserId);
            Assert.Equal(Username, loginBody.Username);
            Assert.Equal("Admin", loginBody.Role);

            var setCookie = Assert.Single(login.Headers.GetValues("Set-Cookie"));
            Assert.Contains("HttpOnly", setCookie, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("Secure", setCookie, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("SameSite=None", setCookie, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("Path=/api/auth", setCookie, StringComparison.OrdinalIgnoreCase);
            var cookiePair = setCookie.Split(';', 2)[0];
            var refreshToken = cookiePair[(cookiePair.IndexOf('=') + 1)..];
            Assert.False((await login.Content.ReadAsStringAsync()).Contains(refreshToken, StringComparison.Ordinal));
            Assert.Equal(1, await database.CountRowsAsync("dbo.RefreshTokens"));

            var signingKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(InitialAdminSeederTests.TestJwtSigningKey));
            var tokenHandler = new JwtSecurityTokenHandler { MapInboundClaims = false };
            var principal = tokenHandler.ValidateToken(
                loginBody.AccessToken,
                new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = signingKey,
                    ValidateIssuer = true,
                    ValidIssuer = "SmartCampus.Api",
                    ValidateAudience = true,
                    ValidAudience = "SmartCampus.Web",
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.Zero,
                    RoleClaimType = "role"
                },
                out var validatedToken);
            Assert.Equal(user.Id.ToString("D"), principal.FindFirst("sub")?.Value);
            Assert.Equal("Admin", principal.FindFirst("role")?.Value);
            Assert.DoesNotContain(principal.Claims, claim =>
                claim.Type is "username" or "name" or "email" or "fullName");
            var jwt = Assert.IsType<JwtSecurityToken>(validatedToken);
            Assert.InRange(jwt.ValidTo, DateTime.UtcNow.AddMinutes(14), DateTime.UtcNow.AddMinutes(16));

            await using (var dbContext = CreateContext(database.ConnectionString))
            {
                var stored = await dbContext.RefreshTokens.AsNoTracking().SingleAsync();
                Assert.Equal(
                    SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken)),
                    stored.TokenHash);
                Assert.InRange(
                    stored.ExpiresAt,
                    DateTimeOffset.UtcNow.AddDays(6),
                    DateTimeOffset.UtcNow.AddDays(7));
            }

            using var refreshRequest = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
            refreshRequest.Headers.Add("Cookie", cookiePair);
            using var refresh = await client.SendAsync(refreshRequest);
            Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
            var refreshedBody = await refresh.Content.ReadFromJsonAsync<AuthResponse>();
            Assert.NotNull(refreshedBody);
            Assert.Equal(user.Id, refreshedBody.UserId);
            Assert.Equal("Admin", refreshedBody.Role);

            using var unknownRefreshRequest = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
            unknownRefreshRequest.Headers.Add("Cookie", "campustour.refresh=unknown-refresh-token");
            using var unknownRefresh = await client.SendAsync(unknownRefreshRequest);
            Assert.Equal(HttpStatusCode.Unauthorized, unknownRefresh.StatusCode);
            AssertRefreshCookieCleared(unknownRefresh);

            using var logoutRequest = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout");
            logoutRequest.Headers.Add("Cookie", cookiePair);
            using var logout = await client.SendAsync(logoutRequest);
            Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
            AssertRefreshCookieCleared(logout);

            await using (var dbContext = CreateContext(database.ConnectionString))
            {
                var stored = await dbContext.RefreshTokens.AsNoTracking().SingleAsync();
                Assert.NotNull(stored.RevokedAt);
            }

            using var revokedRefreshRequest = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
            revokedRefreshRequest.Headers.Add("Cookie", cookiePair);
            using var revokedRefresh = await client.SendAsync(revokedRefreshRequest);
            Assert.Equal(HttpStatusCode.Unauthorized, revokedRefresh.StatusCode);
            AssertRefreshCookieCleared(revokedRefresh);

            using var secondLogin = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { username = Username, password = Password });
            Assert.Equal(HttpStatusCode.OK, secondLogin.StatusCode);
            var secondCookie = Assert.Single(secondLogin.Headers.GetValues("Set-Cookie"))
                .Split(';', 2)[0];
            await database.ExecuteAsync(
                "UPDATE dbo.RefreshTokens SET ExpiresAt=DATEADD(second,-1,SYSDATETIMEOFFSET()) WHERE RevokedAt IS NULL;");

            using var expiredRefreshRequest = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
            expiredRefreshRequest.Headers.Add("Cookie", secondCookie);
            using var expiredRefresh = await client.SendAsync(expiredRefreshRequest);
            Assert.Equal(HttpStatusCode.Unauthorized, expiredRefresh.StatusCode);
            AssertRefreshCookieCleared(expiredRefresh);
        }
        finally
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            _ = await standardOutput;
            _ = await standardError;
        }
    }

    [SchemaV11Fact]
    public async Task InitialAdminSeederAdmin_CanLoginWithHashedPasswordAndSingleRole()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        Assert.Equal(
            InitialAdminSeedResult.Created,
            await database.SeedAsync(Username, Password, "System Administrator"));
        var user = await database.GetOnlyUserAsync();
        var port = InitialAdminSeederTests.GetFreePort();
        using var process = InitialAdminSeederTests.StartApiProcess(database.ConnectionString, [], port);
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();

        try
        {
            using var client = new HttpClient
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}"),
                Timeout = TimeSpan.FromSeconds(3)
            };
            await WaitForApiAsync(process, client, standardOutput, standardError);

            using var login = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "SYSTEM.ADMIN", password = Password });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            var response = await login.Content.ReadFromJsonAsync<AuthResponse>();
            Assert.NotNull(response);
            Assert.Equal(user.Id, response.UserId);
            Assert.Equal(Username, response.Username);
            Assert.Equal("Admin", response.Role);
            Assert.Single(login.Headers.GetValues("Set-Cookie"));
            Assert.True(new IdentityPasswordHasher().Verify(Password, user.PasswordHash));
            Assert.Equal("ADMIN", await database.GetOnlyRoleAsync(user.Id));
        }
        finally
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            _ = await standardOutput;
            _ = await standardError;
        }
    }

    [SchemaV11Fact]
    public async Task Login_RejectsUnknownInactiveMissingMultipleAndUnsupportedRoles()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(
            isActive: false,
            addAdminRole: true,
            username: "inactive.admin");
        await database.InsertUserAsync(
            isActive: true,
            username: "no.role");
        await database.InsertUserAsync(
            isActive: true,
            username: "multi.role",
            roles: ["ADMIN", "STAFF"]);
        await database.InsertUserAsync(
            isActive: true,
            username: "unsupported.role",
            roles: ["VISITOR"]);

        var port = InitialAdminSeederTests.GetFreePort();
        using var process = InitialAdminSeederTests.StartApiProcess(database.ConnectionString, [], port);
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();
        try
        {
            using var client = new HttpClient
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}"),
                Timeout = TimeSpan.FromSeconds(3)
            };
            await WaitForApiAsync(process, client, standardOutput, standardError);

            using var unknown = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "unknown.account", password = Password });
            Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);

            foreach (var username in new[] { "inactive.admin", "no.role", "multi.role", "unsupported.role" })
            {
                using var login = await client.PostAsJsonAsync(
                    "/api/auth/login",
                    new { username, password = Password });
                Assert.Equal(HttpStatusCode.Forbidden, login.StatusCode);
            }

            Assert.Equal(0, await database.CountRowsAsync("dbo.RefreshTokens"));
        }
        finally
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            _ = await standardOutput;
            _ = await standardError;
        }
    }

    [SchemaV11Fact]
    public async Task LogoutFailure_ReturnsErrorEnvelopeAndClearsRefreshCookie()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.SeedAsync(Username, Password, "System Administrator");
        var port = InitialAdminSeederTests.GetFreePort();
        using var process = InitialAdminSeederTests.StartApiProcess(database.ConnectionString, [], port);
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();

        try
        {
            using var client = new HttpClient
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}"),
                Timeout = TimeSpan.FromSeconds(3)
            };
            await WaitForApiAsync(process, client, standardOutput, standardError);

            using var login = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { username = Username, password = Password });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            var refreshCookie = Assert.Single(login.Headers.GetValues("Set-Cookie"))
                .Split(';', 2)[0];

            await database.ExecuteAsync("""
                CREATE TRIGGER dbo.FailRefreshTokenRevoke ON dbo.RefreshTokens
                AFTER UPDATE
                AS
                BEGIN
                    THROW 51011, 'Test-only refresh revoke failure.', 1;
                END;
                """);

            using var logoutRequest = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout");
            logoutRequest.Headers.Add("Cookie", refreshCookie);
            using var logout = await client.SendAsync(logoutRequest);
            Assert.Equal(HttpStatusCode.InternalServerError, logout.StatusCode);
            AssertRefreshCookieCleared(logout);
            using var body = JsonDocument.Parse(await logout.Content.ReadAsStringAsync());
            Assert.False(body.RootElement.GetProperty("success").GetBoolean());
            Assert.Equal("An unexpected error occurred.", body.RootElement.GetProperty("message").GetString());
            Assert.DoesNotContain("Test-only", await logout.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }
        finally
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            _ = await standardOutput;
            _ = await standardError;
        }
    }

    private static void AssertRefreshCookieCleared(HttpResponseMessage response)
    {
        var setCookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        Assert.StartsWith("campustour.refresh=", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Path=/api/auth", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("HttpOnly", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Secure", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SameSite=None", setCookie, StringComparison.OrdinalIgnoreCase);
        var expiresPart = setCookie.Split(';', StringSplitOptions.TrimEntries)
            .Single(part => part.StartsWith("expires=", StringComparison.OrdinalIgnoreCase));
        Assert.True(DateTimeOffset.TryParse(
            expiresPart["expires=".Length..],
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal,
            out var expiresAt));
        Assert.True(expiresAt <= DateTimeOffset.UtcNow);
    }

    private static async Task WaitForApiAsync(
        Process process,
        HttpClient client,
        Task<string> standardOutput,
        Task<string> standardError)
    {
        var readyBy = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < readyBy && !process.HasExited)
        {
            try
            {
                using var response = await client.GetAsync("/");
                return;
            }
            catch (HttpRequestException)
            {
                await Task.Delay(100);
            }
            catch (TaskCanceledException)
            {
                await Task.Delay(100);
            }
        }

        var output = await standardOutput;
        var error = await standardError;
        Assert.Fail($"API did not start for auth integration test. stdout: {output}; stderr: {error}");
    }

    private static ApplicationDbContext CreateContext(string connectionString) =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(connectionString)
            .Options);

    private sealed record AuthResponse(string AccessToken, Guid UserId, string Username, string Role);
}
