using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class AccountEndpointTests
{
    private const string Password = "integration-test-password";
    private const string FullName = "Account Integration Test";

    [SchemaV11Fact]
    public async Task AdminAccounts_RequireAdminAndAllowAdmin()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(isActive: true, username: "accounts.admin", roles: ["ADMIN"]);
        await database.InsertUserAsync(isActive: true, username: "accounts.staff", roles: ["STAFF"]);
        await database.InsertUserAsync(
            isActive: true,
            username: "accounts.representative",
            roles: ["SCHOOL_REPRESENTATIVE"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);

        using var anonymous = await host.Client.GetAsync("/api/admin/accounts");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var staffToken = await GetAccessTokenAsync(host.Client, "accounts.staff");
        using var staffRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts",
            staffToken);
        using var staffResponse = await host.Client.SendAsync(staffRequest);
        Assert.Equal(HttpStatusCode.Forbidden, staffResponse.StatusCode);

        var representativeToken = await GetAccessTokenAsync(host.Client, "accounts.representative");
        using var representativeRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts",
            representativeToken);
        using var representativeResponse = await host.Client.SendAsync(representativeRequest);
        Assert.Equal(HttpStatusCode.Forbidden, representativeResponse.StatusCode);

        var adminToken = await GetAccessTokenAsync(host.Client, "accounts.admin");
        using var adminRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts",
            adminToken);
        using var adminResponse = await host.Client.SendAsync(adminRequest);
        Assert.Equal(HttpStatusCode.OK, adminResponse.StatusCode);
    }

    [SchemaV11Fact]
    public async Task ListAccounts_PagesDeterministicallyAndReturnsOnlySafeFields()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(isActive: true, username: "list.admin", roles: ["ADMIN"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var token = await GetAccessTokenAsync(host.Client, "list.admin");

        using var staffCreate = await CreateAccountAsync(host.Client, token, new
        {
            username = "list.staff",
            fullName = "List Staff",
            role = "Staff",
            initialPassword = "staff initial password"
        });
        using var representativeCreate = await CreateAccountAsync(host.Client, token, new
        {
            username = "list.representative",
            fullName = "List Representative",
            role = "Representative",
            initialPassword = "representative initial password"
        });
        Assert.Equal(HttpStatusCode.OK, staffCreate.StatusCode);
        Assert.Equal(HttpStatusCode.OK, representativeCreate.StatusCode);

        await database.ExecuteAsync(
            "UPDATE dbo.Users SET CreatedAt = '2025-01-01T00:00:00+00:00';");

        using var allRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts?page=1&size=20",
            token);
        using var allResponse = await host.Client.SendAsync(allRequest);
        Assert.Equal(HttpStatusCode.OK, allResponse.StatusCode);
        using var allDocument = JsonDocument.Parse(await allResponse.Content.ReadAsStringAsync());
        var allItems = allDocument.RootElement.GetProperty("data").EnumerateArray().ToArray();
        Assert.Equal(3, allItems.Length);
        Assert.Equal(3, allDocument.RootElement.GetProperty("pagination").GetProperty("totalItems").GetInt32());
        foreach (var item in allItems)
        {
            var names = item.EnumerateObject().Select(property => property.Name).Order().ToArray();
            Assert.Equal(
                new[] { "createdAt", "fullName", "id", "isActive", "role", "updatedAt", "username" }.Order(),
                names);
        }

        using var firstRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts?page=1&size=2",
            token);
        using var firstResponse = await host.Client.SendAsync(firstRequest);
        using var firstDocument = JsonDocument.Parse(await firstResponse.Content.ReadAsStringAsync());
        var firstIds = firstDocument.RootElement.GetProperty("data")
            .EnumerateArray()
            .Select(item => item.GetProperty("id").GetString())
            .ToArray();

        using var secondRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts?page=2&size=2",
            token);
        using var secondResponse = await host.Client.SendAsync(secondRequest);
        using var secondDocument = JsonDocument.Parse(await secondResponse.Content.ReadAsStringAsync());
        var secondIds = secondDocument.RootElement.GetProperty("data")
            .EnumerateArray()
            .Select(item => item.GetProperty("id").GetString())
            .ToArray();

        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        Assert.Equal(
            allItems.Select(item => item.GetProperty("id").GetString()),
            firstIds.Concat(secondIds));
        Assert.Equal(1, firstDocument.RootElement.GetProperty("pagination").GetProperty("page").GetInt32());
        Assert.Equal(2, secondDocument.RootElement.GetProperty("pagination").GetProperty("page").GetInt32());
        Assert.Equal(2, firstDocument.RootElement.GetProperty("pagination").GetProperty("pageSize").GetInt32());

        using var repeatedRequest = CreateAuthenticatedRequest(HttpMethod.Get, "/api/admin/accounts", token);
        using var repeatedResponse = await host.Client.SendAsync(repeatedRequest);
        using var repeatedDocument = JsonDocument.Parse(await repeatedResponse.Content.ReadAsStringAsync());
        Assert.Equal(
            allItems.Select(item => item.GetProperty("id").GetString()),
            repeatedDocument.RootElement.GetProperty("data")
                .EnumerateArray()
                .Select(item => item.GetProperty("id").GetString()));
    }

    [SchemaV11Fact]
    public async Task ListAccounts_SearchesAndSortsInDatabase()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(isActive: true, username: "query.admin", roles: ["ADMIN"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var token = await GetAccessTokenAsync(host.Client, "query.admin");

        using var staffResponse = await CreateAccountAsync(host.Client, token, new
        {
            username = "query.zulu",
            fullName = "Needle Search Name",
            role = "Staff",
            initialPassword = "query staff password"
        });
        using var representativeResponse = await CreateAccountAsync(host.Client, token, new
        {
            username = "query.alpha",
            fullName = "Distinct Full Name",
            role = "Representative",
            initialPassword = "query representative password"
        });
        Assert.Equal(HttpStatusCode.OK, staffResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, representativeResponse.StatusCode);

        await database.ExecuteAsync("""
            UPDATE dbo.Users
            SET CreatedAt = CASE Username
                WHEN 'query.admin' THEN '2025-01-03T00:00:00+00:00'
                WHEN 'query.alpha' THEN '2025-01-02T00:00:00+00:00'
                WHEN 'query.zulu' THEN '2025-01-01T00:00:00+00:00'
                ELSE CreatedAt
            END;
            """);

        using var usernameSearch = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts?search=%20%20zulu%20%20&page=1&size=5",
            token);
        using var usernameSearchResponse = await host.Client.SendAsync(usernameSearch);
        using var usernameSearchDocument = JsonDocument.Parse(
            await usernameSearchResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, usernameSearchResponse.StatusCode);
        Assert.Equal(
            "query.zulu",
            Assert.Single(usernameSearchDocument.RootElement.GetProperty("data").EnumerateArray())
                .GetProperty("username").GetString());
        Assert.Equal(1, usernameSearchDocument.RootElement.GetProperty("pagination")
            .GetProperty("totalItems").GetInt32());

        using var fullNameSearch = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts?search=Distinct&page=1&size=5",
            token);
        using var fullNameSearchResponse = await host.Client.SendAsync(fullNameSearch);
        using var fullNameSearchDocument = JsonDocument.Parse(
            await fullNameSearchResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, fullNameSearchResponse.StatusCode);
        Assert.Equal(
            "query.alpha",
            Assert.Single(fullNameSearchDocument.RootElement.GetProperty("data").EnumerateArray())
                .GetProperty("username").GetString());

        using var ascendingRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts?sort=username&page=1&size=10",
            token);
        using var ascendingResponse = await host.Client.SendAsync(ascendingRequest);
        using var ascendingDocument = JsonDocument.Parse(await ascendingResponse.Content.ReadAsStringAsync());
        Assert.Equal(
            new[] { "query.admin", "query.alpha", "query.zulu" },
            ascendingDocument.RootElement.GetProperty("data")
                .EnumerateArray()
                .Select(item => item.GetProperty("username").GetString()));

        using var descendingRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts?sort=-createdAt&page=1&size=10",
            token);
        using var descendingResponse = await host.Client.SendAsync(descendingRequest);
        using var descendingDocument = JsonDocument.Parse(await descendingResponse.Content.ReadAsStringAsync());
        Assert.Equal(
            new[] { "query.admin", "query.alpha", "query.zulu" },
            descendingDocument.RootElement.GetProperty("data")
                .EnumerateArray()
                .Select(item => item.GetProperty("username").GetString()));

        using var roleSortRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts?sort=role&page=1&size=10",
            token);
        using var roleSortResponse = await host.Client.SendAsync(roleSortRequest);
        using var roleSortDocument = JsonDocument.Parse(await roleSortResponse.Content.ReadAsStringAsync());
        Assert.Equal(
            new[] { "query.admin", "query.alpha", "query.zulu" },
            roleSortDocument.RootElement.GetProperty("data")
                .EnumerateArray()
                .Select(item => item.GetProperty("username").GetString()));

        using var invalidSortRequest = CreateAuthenticatedRequest(
            HttpMethod.Get,
            "/api/admin/accounts?sort=passwordHash",
            token);
        using var invalidSortResponse = await host.Client.SendAsync(invalidSortRequest);
        Assert.Equal(HttpStatusCode.BadRequest, invalidSortResponse.StatusCode);
    }

    [SchemaV11Fact]
    public async Task ListAccounts_ReturnsInvalidRolesAsNullAndLifecycleStillFailsClosed()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(isActive: true, username: "invalid.roles.admin", roles: ["ADMIN"]);
        var invalidMultiRole = await database.InsertUserAsync(
            isActive: true,
            username: "invalid.roles.target",
            roles: ["STAFF", "SCHOOL_REPRESENTATIVE"]);
        var invalidCode = await database.InsertUserAsync(
            isActive: true,
            username: "invalid.roles.unknown",
            roles: ["VISITOR"]);
        await database.InsertUserAsync(isActive: true, username: "invalid.roles.valid", roles: ["STAFF"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var token = await GetAccessTokenAsync(host.Client, "invalid.roles.admin");

        using var request = CreateAuthenticatedRequest(HttpMethod.Get, "/api/admin/accounts", token);
        using var response = await host.Client.SendAsync(request);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var accounts = document.RootElement.GetProperty("data").EnumerateArray().ToArray();
        Assert.Equal(4, accounts.Length);
        Assert.Equal("Admin", FindAccount(accounts, "invalid.roles.admin").GetProperty("role").GetString());
        Assert.Equal("Staff", FindAccount(accounts, "invalid.roles.valid").GetProperty("role").GetString());
        Assert.Equal(JsonValueKind.Null, FindAccount(accounts, "invalid.roles.target").GetProperty("role").ValueKind);
        Assert.Equal(JsonValueKind.Null, FindAccount(accounts, "invalid.roles.unknown").GetProperty("role").ValueKind);

        foreach (var target in new[] { invalidMultiRole, invalidCode })
        {
            using var lifecycleRequest = CreateAuthenticatedRequest(
                HttpMethod.Post,
                $"/api/admin/accounts/{target.Id:D}/deactivate",
                token);
            using var lifecycleResponse = await host.Client.SendAsync(lifecycleRequest);
            Assert.Equal(HttpStatusCode.Forbidden, lifecycleResponse.StatusCode);
        }
    }

    [SchemaV11Fact]
    public async Task ListAccounts_RejectsInvalidSizeAndExpansion()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(isActive: true, username: "query.validation.admin", roles: ["ADMIN"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var token = await GetAccessTokenAsync(host.Client, "query.validation.admin");

        foreach (var query in new[] { "?page=0&size=20", "?page=1&size=101", "?expand=x" })
        {
            using var request = CreateAuthenticatedRequest(
                HttpMethod.Get,
                $"/api/admin/accounts{query}",
                token);
            using var response = await host.Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }

    [SchemaV11Fact]
    public async Task CreateAccount_EnforcesRoleAndUsernameContractsAndStoresOnlyHashAndAudit()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var admin = await database.InsertUserAsync(
            isActive: true,
            username: "create.admin",
            roles: ["ADMIN"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var token = await GetAccessTokenAsync(host.Client, "create.admin");
        const string rawPassword = "  initial password with spaces  ";

        foreach (var username in new[] { " created.staff", "created.staff ", "created staff", "created\tstaff", "created\u00a0staff" })
        {
            using var invalidUsername = await CreateAccountAsync(host.Client, token, new
            {
                username,
                fullName = "Created Staff",
                role = "Staff",
                initialPassword = rawPassword
            });
            Assert.Equal(HttpStatusCode.BadRequest, invalidUsername.StatusCode);
            Assert.Equal(1, await database.CountRowsAsync("dbo.Users"));
            Assert.Equal(0, await database.CountRowsAsync("dbo.AuditLogs"));
        }

        using var staffResponse = await CreateAccountAsync(host.Client, token, new
        {
            username = "created.staff",
            fullName = " Created Staff ",
            role = "Staff",
            initialPassword = rawPassword
        });
        Assert.Equal(HttpStatusCode.OK, staffResponse.StatusCode);
        using var staffDocument = JsonDocument.Parse(await staffResponse.Content.ReadAsStringAsync());
        var staffId = Guid.Parse(staffDocument.RootElement.GetProperty("data").GetProperty("id").GetString()!);

        using var representativeResponse = await CreateAccountAsync(host.Client, token, new
        {
            username = "created.representative",
            fullName = "Created Representative",
            role = "Representative",
            initialPassword = "representative initial password"
        });
        Assert.Equal(HttpStatusCode.OK, representativeResponse.StatusCode);

        using var adminRoleResponse = await CreateAccountAsync(host.Client, token, new
        {
            username = "rejected.admin",
            fullName = "Rejected Admin",
            role = "Admin",
            initialPassword = "admin initial password"
        });
        Assert.Equal(HttpStatusCode.BadRequest, adminRoleResponse.StatusCode);

        using var unsupportedRoleResponse = await CreateAccountAsync(host.Client, token, new
        {
            username = "rejected.student",
            fullName = "Rejected Student",
            role = "Student",
            initialPassword = "student initial password"
        });
        Assert.Equal(HttpStatusCode.BadRequest, unsupportedRoleResponse.StatusCode);

        using var extraPropertiesResponse = await CreateAccountAsync(host.Client, token, new
        {
            username = "rejected.extra",
            fullName = "Rejected Extra",
            role = "Staff",
            initialPassword = "must not persist",
            roles = new[] { "Staff" },
            isActive = false,
            actorUserId = Guid.NewGuid()
        });
        Assert.Equal(HttpStatusCode.BadRequest, extraPropertiesResponse.StatusCode);

        using var duplicateResponse = await CreateAccountAsync(host.Client, token, new
        {
            username = "CREATED.STAFF",
            fullName = "Duplicate Staff",
            role = "Staff",
            initialPassword = "duplicate password"
        });
        Assert.Equal(HttpStatusCode.Conflict, duplicateResponse.StatusCode);

        await using var context = CreateContext(database.ConnectionString);
        var storedStaff = await context.Users
            .Include(user => user.UserRoles)
            .SingleAsync(user => user.Id == staffId);
        var storedRepresentative = await context.Users
            .Include(user => user.UserRoles)
            .SingleAsync(user => user.Username == "created.representative");
        Assert.Equal("created.staff", storedStaff.Username);
        Assert.Single(storedStaff.UserRoles);
        Assert.Equal("STAFF", Assert.Single(storedStaff.UserRoles).Role);
        Assert.Single(storedRepresentative.UserRoles);
        Assert.Equal("SCHOOL_REPRESENTATIVE", Assert.Single(storedRepresentative.UserRoles).Role);
        Assert.True(new IdentityPasswordHasher().Verify(rawPassword, storedStaff.PasswordHash));
        Assert.False(new IdentityPasswordHasher().Verify(rawPassword.Trim(), storedStaff.PasswordHash));
        Assert.DoesNotContain(rawPassword, storedStaff.PasswordHash, StringComparison.Ordinal);

        Assert.Equal(3, await database.CountRowsAsync("dbo.Users"));
        Assert.Equal(3, await database.CountRowsAsync("dbo.UserRoles"));
        var createAudits = await context.AuditLogs
            .Where(audit => audit.Action == "ACCOUNT_CREATED")
            .OrderBy(audit => audit.Id)
            .ToArrayAsync();
        Assert.Equal(2, createAudits.Length);
        Assert.Contains(createAudits, audit =>
            audit.ActorUserId == admin.Id
            && audit.EntityId == staffId.ToString("D")
            && audit.EntityType == "User"
            && audit.DataJson is null);
        Assert.Contains(createAudits, audit =>
            audit.ActorUserId == admin.Id
            && audit.EntityId == storedRepresentative.Id.ToString("D")
            && audit.EntityType == "User"
            && audit.DataJson is null);
        Assert.All(createAudits, audit =>
        {
            Assert.Equal(admin.Id, audit.ActorUserId);
            Assert.Equal("User", audit.EntityType);
            Assert.Null(audit.DataJson);
        });
    }

    [SchemaV11Fact]
    public async Task DeactivateAndReactivate_RevokesRefreshTokensAndIsIdempotent()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var admin = await database.InsertUserAsync(
            isActive: true,
            username: "lifecycle.admin",
            roles: ["ADMIN"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var adminToken = await GetAccessTokenAsync(host.Client, "lifecycle.admin");

        using var staffCreate = await CreateAccountAsync(host.Client, adminToken, new
        {
            username = "lifecycle.staff",
            fullName = "Lifecycle Staff",
            role = "Staff",
            initialPassword = "staff lifecycle password"
        });
        using var representativeCreate = await CreateAccountAsync(host.Client, adminToken, new
        {
            username = "lifecycle.representative",
            fullName = "Lifecycle Representative",
            role = "Representative",
            initialPassword = "representative lifecycle password"
        });
        using var staffCreateDocument = JsonDocument.Parse(await staffCreate.Content.ReadAsStringAsync());
        using var representativeCreateDocument = JsonDocument.Parse(
            await representativeCreate.Content.ReadAsStringAsync());
        var staffId = Guid.Parse(staffCreateDocument.RootElement.GetProperty("data").GetProperty("id").GetString()!);
        var representativeId = Guid.Parse(
            representativeCreateDocument.RootElement.GetProperty("data").GetProperty("id").GetString()!);
        var firstStaffSession = await LoginAsync(host.Client, "lifecycle.staff", "staff lifecycle password");
        _ = await LoginAsync(host.Client, "lifecycle.staff", "staff lifecycle password");

        using var adminTargetRequest = CreateAuthenticatedRequest(
            HttpMethod.Post,
            $"/api/admin/accounts/{admin.Id:D}/deactivate",
            adminToken);
        using var adminTargetResponse = await host.Client.SendAsync(adminTargetRequest);
        Assert.Equal(HttpStatusCode.Forbidden, adminTargetResponse.StatusCode);

        using var adminReactivateRequest = CreateAuthenticatedRequest(
            HttpMethod.Post,
            $"/api/admin/accounts/{admin.Id:D}/reactivate",
            adminToken);
        using var adminReactivateResponse = await host.Client.SendAsync(adminReactivateRequest);
        Assert.Equal(HttpStatusCode.Forbidden, adminReactivateResponse.StatusCode);

        using var deactivateRequest = CreateAuthenticatedRequest(
            HttpMethod.Post,
            $"/api/admin/accounts/{staffId:D}/deactivate",
            adminToken);
        using var deactivateResponse = await host.Client.SendAsync(deactivateRequest);
        Assert.Equal(HttpStatusCode.OK, deactivateResponse.StatusCode);

        DateTimeOffset firstUpdatedAt;
        await using (var context = CreateContext(database.ConnectionString))
        {
            var staff = await context.Users.SingleAsync(user => user.Id == staffId);
            Assert.False(staff.IsActive);
            Assert.NotNull(staff.UpdatedAt);
            firstUpdatedAt = staff.UpdatedAt!.Value;

            var tokens = await context.RefreshTokens.Where(token => token.UserId == staffId).ToArrayAsync();
            Assert.Equal(2, tokens.Length);
            Assert.All(tokens, token => Assert.NotNull(token.RevokedAt));
            Assert.Equal(1, await context.AuditLogs.CountAsync(audit =>
                audit.Action == "ACCOUNT_DEACTIVATED" && audit.EntityId == staffId.ToString("D")));
        }

        using var inactiveLogin = await host.Client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "lifecycle.staff", password = "staff lifecycle password" });
        Assert.Equal(HttpStatusCode.Forbidden, inactiveLogin.StatusCode);
        using var rejectedRefresh = await RefreshAsync(host.Client, firstStaffSession.Cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, rejectedRefresh.StatusCode);

        using var repeatedDeactivateRequest = CreateAuthenticatedRequest(
            HttpMethod.Post,
            $"/api/admin/accounts/{staffId:D}/deactivate",
            adminToken);
        using var repeatedDeactivateResponse = await host.Client.SendAsync(repeatedDeactivateRequest);
        Assert.Equal(HttpStatusCode.OK, repeatedDeactivateResponse.StatusCode);
        await using (var context = CreateContext(database.ConnectionString))
        {
            var staff = await context.Users.SingleAsync(user => user.Id == staffId);
            Assert.Equal(firstUpdatedAt, staff.UpdatedAt);
            Assert.Equal(1, await context.AuditLogs.CountAsync(audit =>
                audit.Action == "ACCOUNT_DEACTIVATED" && audit.EntityId == staffId.ToString("D")));
        }

        using var reactivateRequest = CreateAuthenticatedRequest(
            HttpMethod.Post,
            $"/api/admin/accounts/{staffId:D}/reactivate",
            adminToken);
        using var reactivateResponse = await host.Client.SendAsync(reactivateRequest);
        Assert.Equal(HttpStatusCode.OK, reactivateResponse.StatusCode);
        DateTimeOffset firstReactivatedAt;
        await using (var context = CreateContext(database.ConnectionString))
        {
            var staff = await context.Users.SingleAsync(user => user.Id == staffId);
            Assert.True(staff.IsActive);
            Assert.NotNull(staff.UpdatedAt);
            firstReactivatedAt = staff.UpdatedAt!.Value;
            Assert.Equal(1, await context.AuditLogs.CountAsync(audit =>
                audit.Action == "ACCOUNT_REACTIVATED" && audit.EntityId == staffId.ToString("D")));
            Assert.All(
                await context.RefreshTokens.Where(token => token.UserId == staffId).ToArrayAsync(),
                token => Assert.NotNull(token.RevokedAt));
        }

        using var oldRefreshAfterReactivation = await RefreshAsync(host.Client, firstStaffSession.Cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, oldRefreshAfterReactivation.StatusCode);
        var freshSession = await LoginAsync(host.Client, "lifecycle.staff", "staff lifecycle password");
        Assert.False(string.IsNullOrWhiteSpace(freshSession.AccessToken));

        using var repeatedReactivateRequest = CreateAuthenticatedRequest(
            HttpMethod.Post,
            $"/api/admin/accounts/{staffId:D}/reactivate",
            adminToken);
        using var repeatedReactivateResponse = await host.Client.SendAsync(repeatedReactivateRequest);
        Assert.Equal(HttpStatusCode.OK, repeatedReactivateResponse.StatusCode);
        await using (var context = CreateContext(database.ConnectionString))
        {
            var staff = await context.Users.SingleAsync(user => user.Id == staffId);
            Assert.Equal(firstReactivatedAt, staff.UpdatedAt);
            Assert.Equal(1, await context.AuditLogs.CountAsync(audit =>
                audit.Action == "ACCOUNT_REACTIVATED" && audit.EntityId == staffId.ToString("D")));
        }

        using var representativeDeactivate = CreateAuthenticatedRequest(
            HttpMethod.Post,
            $"/api/admin/accounts/{representativeId:D}/deactivate",
            adminToken);
        using var representativeDeactivateResponse = await host.Client.SendAsync(representativeDeactivate);
        Assert.Equal(HttpStatusCode.OK, representativeDeactivateResponse.StatusCode);
        await using var finalContext = CreateContext(database.ConnectionString);
        Assert.False((await finalContext.Users.SingleAsync(user => user.Id == representativeId)).IsActive);
        Assert.Equal(1, await finalContext.AuditLogs.CountAsync(audit =>
            audit.Action == "ACCOUNT_DEACTIVATED" && audit.EntityId == representativeId.ToString("D")));
    }

    [SchemaV11Fact]
    public async Task LifecycleEndpoints_ReturnNotFoundForMissingTargets()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(isActive: true, username: "missing.admin", roles: ["ADMIN"]);
        await using var host = await ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var adminToken = await GetAccessTokenAsync(host.Client, "missing.admin");
        var missingId = Guid.NewGuid();

        using var deactivateRequest = CreateAuthenticatedRequest(
            HttpMethod.Post,
            $"/api/admin/accounts/{missingId:D}/deactivate",
            adminToken);
        using var deactivateResponse = await host.Client.SendAsync(deactivateRequest);

        using var reactivateRequest = CreateAuthenticatedRequest(
            HttpMethod.Post,
            $"/api/admin/accounts/{missingId:D}/reactivate",
            adminToken);
        using var reactivateResponse = await host.Client.SendAsync(reactivateRequest);

        Assert.Equal(HttpStatusCode.NotFound, deactivateResponse.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, reactivateResponse.StatusCode);
    }

    private static async Task<HttpResponseMessage> CreateAccountAsync(
        HttpClient client,
        string accessToken,
        object body)
    {
        var request = CreateAuthenticatedRequest(HttpMethod.Post, "/api/admin/accounts", accessToken);
        request.Content = JsonContent.Create(body);
        return await client.SendAsync(request);
    }

    private static async Task<string> GetAccessTokenAsync(HttpClient client, string username)
    {
        var session = await LoginAsync(client, username, Password);
        return session.AccessToken;
    }

    private static async Task<LoginSession> LoginAsync(
        HttpClient client,
        string username,
        string password)
    {
        using var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { username, password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var token = document.RootElement.GetProperty("accessToken").GetString();
        var setCookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));
        var cookie = setCookie.Split(';', 2)[0];
        Assert.False(string.IsNullOrWhiteSpace(token));
        return new LoginSession(token!, cookie);
    }

    private static async Task<HttpResponseMessage> RefreshAsync(HttpClient client, string cookie)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
        request.Headers.Add("Cookie", cookie);
        return await client.SendAsync(request);
    }

    private static HttpRequestMessage CreateAuthenticatedRequest(
        HttpMethod method,
        string path,
        string accessToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return request;
    }

    private static JsonElement FindAccount(IEnumerable<JsonElement> accounts, string username) =>
        Assert.Single(accounts, account =>
            account.GetProperty("username").GetString() == username);

    private static ApplicationDbContext CreateContext(string connectionString) =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(connectionString)
            .Options);

    private sealed record LoginSession(string AccessToken, string Cookie);

    private sealed class ApiHost : IAsyncDisposable
    {
        private readonly Process process;
        private readonly Task<string> standardOutput;
        private readonly Task<string> standardError;

        private ApiHost(Process process, int port)
        {
            this.process = process;
            standardOutput = process.StandardOutput.ReadToEndAsync();
            standardError = process.StandardError.ReadToEndAsync();
            Client = new HttpClient
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}"),
                Timeout = TimeSpan.FromSeconds(5)
            };
        }

        public HttpClient Client { get; }

        public static async Task<ApiHost> StartForDatabaseAsync(string connectionString)
        {
            var port = InitialAdminSeederTests.GetFreePort();
            var host = new ApiHost(
                InitialAdminSeederTests.StartApiProcess(connectionString, [], port),
                port);
            await host.WaitUntilReadyAsync();
            return host;
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            _ = await standardOutput;
            _ = await standardError;
        }

        private async Task WaitUntilReadyAsync()
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            while (!timeout.IsCancellationRequested && !process.HasExited)
            {
                try
                {
                    using var response = await Client.PostAsync(
                        "/api/auth/refresh",
                        content: null,
                        timeout.Token);
                    return;
                }
                catch (HttpRequestException)
                {
                    await Task.Delay(100, timeout.Token);
                }
                catch (TaskCanceledException) when (!timeout.IsCancellationRequested)
                {
                    await Task.Delay(100, timeout.Token);
                }
            }

            var output = await Task.WhenAll(standardOutput, standardError);
            throw new InvalidOperationException(
                $"API did not become ready. {string.Join(Environment.NewLine, output)}");
        }
    }
}
