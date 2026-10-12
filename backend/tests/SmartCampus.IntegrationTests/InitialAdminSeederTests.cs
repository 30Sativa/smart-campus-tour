using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Authentication.Seeding;
using SmartCampus.Infrastructure.Authentication.UsernameNormalization;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class InitialAdminSeederTests
{
    private const string Username = "system.admin";
    private const string Password = "integration-test-password";
    private const string FullName = "System Administrator";
    internal const string TestJwtSigningKey = "integration-test-jwt-signing-key-32-bytes-minimum";

    [Theory]
    [InlineData(" system.admin")]
    [InlineData("system.admin ")]
    [InlineData("system admin")]
    [InlineData("system\tadmin")]
    [InlineData("system\u00a0admin")]
    public async Task SeedAsync_RejectsUsernameWhitespaceBeforeAccessingDatabase(string username)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer("Server=unreachable.invalid;Database=unused;Integrated Security=true")
            .Options;
        await using var context = new ApplicationDbContext(options);
        var seeder = new InitialAdminSeeder(context, new IdentityPasswordHasher(), new InvariantUsernameNormalizer());

        var exception = await Assert.ThrowsAsync<ArgumentException>(
            () => seeder.SeedAsync(username, Password, FullName));

        Assert.Equal("username", exception.ParamName);
        Assert.Contains("must not contain whitespace", exception.Message);
    }

    [SchemaV11Fact]
    public async Task SeedAsync_CreatesAdminAndLeavesOtherTablesEmpty()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();

        var result = await database.SeedAsync(Username, Password, FullName);

        Assert.Equal(InitialAdminSeedResult.Created, result);
        var user = await database.GetOnlyUserAsync();
        Assert.Equal("system.admin", user.Username);
        Assert.Equal("SYSTEM.ADMIN", user.NormalizedUsername);
        Assert.Equal(FullName, user.FullName);
        Assert.True(user.IsActive);
        Assert.Equal(TimeSpan.Zero, user.CreatedAt.Offset);
        Assert.NotEqual(Password, user.PasswordHash);
        Assert.True(new IdentityPasswordHasher().Verify(Password, user.PasswordHash));
        Assert.Equal("ADMIN", await database.GetOnlyRoleAsync(user.Id));
        Assert.Equal(0, await database.CountBusinessAndCredentialRowsAsync());
    }

    [SchemaV11Fact]
    public async Task SeedAsync_UsesSharedUserTablesOnV10SchemaWithoutAdoptingV11()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync("snapshot-v1.0.sql");

        var result = await database.SeedAsync(Username, Password, FullName);

        Assert.Equal(InitialAdminSeedResult.Created, result);
        var user = await database.GetOnlyUserAsync();
        Assert.Equal("SYSTEM.ADMIN", user.NormalizedUsername);
        Assert.Equal("ADMIN", await database.GetOnlyRoleAsync(user.Id));
        Assert.Equal(1, await database.CountRowsAsync("dbo.Users"));
        Assert.Equal(1, await database.CountRowsAsync("dbo.UserRoles"));
    }

    [SchemaV11Fact]
    public async Task SeedAsync_RerunSkipsWithoutChangingExistingAccount()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();
        await database.SeedAsync(Username, Password, FullName);
        var original = await database.GetOnlyUserAsync();

        var result = await database.SeedAsync(
            "SYSTEM.ADMIN",
            "different-password-must-not-be-used",
            "Different Full Name");

        var afterRerun = await database.GetOnlyUserAsync();
        Assert.Equal(InitialAdminSeedResult.Skipped, result);
        Assert.Equal(original.Id, afterRerun.Id);
        Assert.Equal(original.PasswordHash, afterRerun.PasswordHash);
        Assert.Equal(original.FullName, afterRerun.FullName);
        Assert.Equal(original.CreatedAt, afterRerun.CreatedAt);
        Assert.Equal(1, await database.CountRowsAsync("dbo.Users"));
        Assert.Equal(1, await database.CountRowsAsync("dbo.UserRoles"));
    }

    [SchemaV11Fact]
    public async Task SeedAsync_ExistingUsernameWithoutAdminRoleIsConflict()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();
        var user = await database.InsertUserAsync(isActive: true);

        var exception = await Assert.ThrowsAsync<InitialAdminSeedConflictException>(
            () => database.SeedAsync(Username, Password, FullName));

        Assert.Contains("does not have the ADMIN role", exception.Message);
        Assert.Equal(user.Id, (await database.GetOnlyUserAsync()).Id);
        Assert.Equal(0, await database.CountRowsAsync("dbo.UserRoles"));
    }

    [SchemaV11Fact]
    public async Task SeedAsync_InactiveExistingAdminIsConflictAndIsNotReactivated()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();
        var user = await database.InsertUserAsync(isActive: false, addAdminRole: true);

        var exception = await Assert.ThrowsAsync<InitialAdminSeedConflictException>(
            () => database.SeedAsync(Username, Password, FullName));

        Assert.Contains("inactive", exception.Message);
        Assert.Equal(user.Id, (await database.GetOnlyUserAsync()).Id);
        Assert.False((await database.GetOnlyUserAsync()).IsActive);
    }

    [SchemaV11Fact]
    public async Task SeedAsync_NormalizedUsernameMismatchIsConflict()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();
        var user = await database.InsertUserAsync(
            isActive: true,
            addAdminRole: true,
            normalizedUsername: "NOT.SYSTEM.ADMIN");

        var exception = await Assert.ThrowsAsync<InitialAdminSeedConflictException>(
            () => database.SeedAsync(Username, Password, FullName));

        Assert.Contains("inconsistent normalized username", exception.Message);
        Assert.Equal(user.Id, (await database.GetOnlyUserAsync()).Id);
        Assert.Equal(1, await database.CountRowsAsync("dbo.Users"));
    }

    [SchemaV11Fact]
    public async Task SeedAsync_RoleInsertFailureRollsBackUser()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();
        await database.ExecuteAsync("""
            CREATE TRIGGER dbo.FailAdminRoleInsert ON dbo.UserRoles
            AFTER INSERT
            AS
            BEGIN
                THROW 51010, 'Test-only role insert failure.', 1;
            END;
            """);

        await Assert.ThrowsAsync<DbUpdateException>(
            () => database.SeedAsync(Username, Password, FullName));

        Assert.Equal(0, await database.CountRowsAsync("dbo.Users"));
        Assert.Equal(0, await database.CountRowsAsync("dbo.UserRoles"));
        Assert.Equal(0, await database.CountBusinessAndCredentialRowsAsync());
    }

    [SchemaV11Fact]
    public async Task InitialAdminSeedCommand_ExitsWithoutStartingHttpServer()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();
        using var process = StartApiProcess(
            database.ConnectionString,
            ["--seed-initial-admin"],
            jwtSigningKey: null,
            environment: "Production");
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            throw new TimeoutException("Initial Admin seed command did not exit.");
        }

        var output = await standardOutput;
        var error = await standardError;
        Assert.Equal(0, process.ExitCode);
        Assert.Contains("Initial Admin seeded.", output);
        Assert.DoesNotContain("Now listening on", output + error, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Password, output + error, StringComparison.Ordinal);
        Assert.Equal("ADMIN", await database.GetOnlyRoleAsync((await database.GetOnlyUserAsync()).Id));
    }

    [SchemaV11Fact]
    public async Task InitialAdminSeedCommand_RejectsPasswordOnCommandLineWithoutEchoingIt()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();
        const string forbiddenCommandLinePassword = "must-not-be-a-command-line-secret";
        using var process = StartApiProcess(
            database.ConnectionString,
            ["--seed-initial-admin", "--InitialAdminSeed__Password", forbiddenCommandLinePassword]);
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await process.WaitForExitAsync(timeout.Token);
        var output = await standardOutput;
        var error = await standardError;

        Assert.NotEqual(0, process.ExitCode);
        Assert.Contains("must be supplied through environment variables or User Secrets", output + error);
        Assert.DoesNotContain(forbiddenCommandLinePassword, output + error, StringComparison.Ordinal);
        Assert.Equal(0, await database.CountRowsAsync("dbo.Users"));
    }

    [SchemaV11Fact]
    public async Task InitialAdminSeedCommand_RejectsUnprefixedPasswordArgumentWithoutStartingHttpServer()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();
        using var process = StartApiProcess(
            database.ConnectionString,
            ["--seed-initial-admin", "InitialAdminSeed:Password=secret"]);
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await process.WaitForExitAsync(timeout.Token);
        var output = await standardOutput;
        var error = await standardError;

        Assert.NotEqual(0, process.ExitCode);
        Assert.Contains("must be supplied through environment variables or User Secrets", output + error);
        Assert.DoesNotContain("Now listening on", output + error, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secret", output + error, StringComparison.Ordinal);
        Assert.Equal(0, await database.CountRowsAsync("dbo.Users"));
    }

    [Fact]
    public async Task NormalApiStartup_FailsFastWhenJwtSigningKeyIsMissing()
    {
        await AssertAuthenticationStartupFailsAsync(
            signingKey: null,
            expectedMessage: "is required for authentication");
    }

    [Fact]
    public async Task NormalApiStartup_FailsFastWhenJwtSigningKeyIsShort()
    {
        await AssertAuthenticationStartupFailsAsync(
            signingKey: "short-test-key",
            expectedMessage: "at least 32 UTF-8 bytes");
    }

    [SchemaV11Fact]
    public async Task NormalApiStartup_DoesNotBootstrapConfiguredAdmin()
    {
        await using var database = await EmptySchemaDatabase.CreateAsync();
        var port = GetFreePort();
        using var process = StartApiProcess(database.ConnectionString, [], port);
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) };
            var address = new Uri($"http://127.0.0.1:{port}/");
            var readyBy = DateTime.UtcNow.AddSeconds(15);
            HttpResponseMessage? response = null;
            while (DateTime.UtcNow < readyBy && !process.HasExited)
            {
                try
                {
                    response = await client.GetAsync(address);
                    break;
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

            Assert.False(process.HasExited, "API exited before it accepted HTTP requests.");
            Assert.NotNull(response);
            Assert.Equal(0, await database.CountRowsAsync("dbo.Users"));
            Assert.Equal(0, await database.CountRowsAsync("dbo.UserRoles"));
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

    internal static Process StartApiProcess(
        string connectionString,
        string[] arguments,
        int? port = null,
        string? jwtSigningKey = TestJwtSigningKey,
        string environment = "Development",
        IReadOnlyDictionary<string, string>? additionalSettings = null)
    {
        var apiAssembly = Path.Combine(AppContext.BaseDirectory, "SmartCampus.Api.dll");
        Assert.True(File.Exists(apiAssembly), $"API assembly not found at {apiAssembly}.");

        var startInfo = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = AppContext.BaseDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        startInfo.ArgumentList.Add(apiAssembly);
        foreach (var argument in arguments)
            startInfo.ArgumentList.Add(argument);

        startInfo.Environment["ASPNETCORE_ENVIRONMENT"] = environment;
        startInfo.Environment["DOTNET_ENVIRONMENT"] = environment;
        startInfo.Environment["ASPNETCORE_URLS"] =
            $"http://127.0.0.1:{port ?? GetFreePort()}";
        startInfo.Environment["ConnectionStrings__DefaultConnection"] = connectionString;
        startInfo.Environment["InitialAdminSeed__Username"] = Username;
        startInfo.Environment["InitialAdminSeed__Password"] = Password;
        startInfo.Environment["InitialAdminSeed__FullName"] = FullName;
        startInfo.Environment.Remove("Authentication__Jwt__SigningKey");
        if (jwtSigningKey is not null)
            startInfo.Environment["Authentication__Jwt__SigningKey"] = jwtSigningKey;
        startInfo.Environment["Cors__AllowedOrigins__0"] = "http://localhost:5173";
        startInfo.Environment["Invitations__Enabled"] = "false";
        if (additionalSettings is not null)
            foreach (var setting in additionalSettings) startInfo.Environment[setting.Key] = setting.Value;

        return Process.Start(startInfo)
            ?? throw new InvalidOperationException("Failed to start API process for integration test.");
    }

    private static async Task AssertAuthenticationStartupFailsAsync(
        string? signingKey,
        string expectedMessage)
    {
        var port = GetFreePort();
        using var process = StartApiProcess(
            "Server=localhost;Database=AuthStartupDoesNotConnect;Integrated Security=true;TrustServerCertificate=true",
            [],
            port,
            signingKey,
            environment: "Production");
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            throw new TimeoutException("API startup did not fail fast for invalid JWT configuration.");
        }

        var output = await standardOutput;
        var error = await standardError;
        Assert.NotEqual(0, process.ExitCode);
        Assert.Contains(expectedMessage, output + error, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Now listening on", output + error, StringComparison.OrdinalIgnoreCase);
        if (signingKey is not null)
            Assert.DoesNotContain(signingKey, output + error, StringComparison.Ordinal);
    }

    internal static int GetFreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    internal sealed class EmptySchemaDatabase : IAsyncDisposable
    {
        private readonly string name;

        private EmptySchemaDatabase(bool demo)
        {
            name = (demo ? "SmartCampusTourPoiDemo_" : "CampusTourInitialAdminSeedTest_") + Guid.NewGuid().ToString("N");
        }
        private readonly SqlConnectionStringBuilder settings = new(
            Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")!)
        {
            InitialCatalog = "master",
            Pooling = false
        };
        private bool created;

        public string ConnectionString => settings.ConnectionString;

        public static async Task<EmptySchemaDatabase> CreateAsync(string snapshot = "snapshot.sql", bool demo = false)
        {
            var database = new EmptySchemaDatabase(demo);
            try
            {
                await using (var master = new SqlConnection(database.settings.ConnectionString))
                {
                    await master.OpenAsync();
                    await ExecuteSqlAsync(master, $"CREATE DATABASE [{database.name}];");
                }
                database.created = true;
                database.settings.InitialCatalog = database.name;
                await database.ApplySnapshotAsync(snapshot);
                return database;
            }
            catch
            {
                await database.DisposeAsync();
                throw;
            }
        }

        public async Task<InitialAdminSeedResult> SeedAsync(
            string username,
            string password,
            string fullName)
        {
            await using var context = CreateContext();
            var seeder = new InitialAdminSeeder(
                context,
                new IdentityPasswordHasher(),
                new InvariantUsernameNormalizer());
            return await seeder.SeedAsync(username, password, fullName);
        }

        public async Task<User> InsertUserAsync(
            bool isActive,
            bool addAdminRole = false,
            string? normalizedUsername = null,
            string? username = null,
            IReadOnlyList<string>? roles = null)
        {
            await using var context = CreateContext();
            var storedUsername = username ?? Username;
            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = storedUsername,
                NormalizedUsername = normalizedUsername ?? new InvariantUsernameNormalizer().Normalize(storedUsername),
                PasswordHash = new IdentityPasswordHasher().Hash(Password),
                FullName = FullName,
                IsActive = isActive,
                CreatedAt = DateTimeOffset.UtcNow
            };
            context.Users.Add(user);
            foreach (var role in roles ?? (addAdminRole ? ["ADMIN"] : []))
                context.UserRoles.Add(new UserRole { UserId = user.Id, Role = role });
            await context.SaveChangesAsync();
            return user;
        }

        public async Task<User> GetOnlyUserAsync()
        {
            await using var context = CreateContext();
            return await context.Users.SingleAsync();
        }

        public async Task<string> GetOnlyRoleAsync(Guid userId)
        {
            await using var context = CreateContext();
            return await context.UserRoles.Where(role => role.UserId == userId)
                .Select(role => role.Role).SingleAsync();
        }

        public async Task<int> CountRowsAsync(string tableName)
        {
            await using var connection = new SqlConnection(ConnectionString);
            await connection.OpenAsync();
            using var command = new SqlCommand($"SELECT COUNT(*) FROM {tableName};", connection);
            return (int)(await command.ExecuteScalarAsync())!;
        }

        public async Task<int> CountBusinessAndCredentialRowsAsync()
        {
            const string sql = """
                SELECT
                    (SELECT COUNT(*) FROM dbo.Tours) +
                    (SELECT COUNT(*) FROM dbo.TourAllowedBranches) +
                    (SELECT COUNT(*) FROM dbo.GroupRegistrations) +
                    (SELECT COUNT(*) FROM dbo.RosterRows) +
                    (SELECT COUNT(*) FROM dbo.Invitations) +
                    (SELECT COUNT(*) FROM dbo.BrowserSessions) +
                    (SELECT COUNT(*) FROM dbo.BranchRequests) +
                    (SELECT COUNT(*) FROM dbo.RefreshTokens) +
                    (SELECT COUNT(*) FROM dbo.TourEvents) +
                    (SELECT COUNT(*) FROM dbo.AuditLogs) +
                    (SELECT COUNT(*) FROM dbo.Robots) +
                    (SELECT COUNT(*) FROM dbo.Routes) +
                    (SELECT COUNT(*) FROM dbo.Pois) +
                    (SELECT COUNT(*) FROM dbo.RouteStops) +
                    (SELECT COUNT(*) FROM dbo.RouteVariants);
                """;
            await using var connection = new SqlConnection(ConnectionString);
            await connection.OpenAsync();
            using var command = new SqlCommand(sql, connection);
            return (int)(await command.ExecuteScalarAsync())!;
        }

        public async Task ExecuteAsync(string sql)
        {
            await using var connection = new SqlConnection(ConnectionString);
            await connection.OpenAsync();
            await ExecuteSqlAsync(connection, sql);
        }

        private ApplicationDbContext CreateContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(ConnectionString)
                .Options;
            return new ApplicationDbContext(options);
        }

        private async Task ApplySnapshotAsync(string snapshot)
        {
            var script = await File.ReadAllTextAsync(
                Path.Combine(AppContext.BaseDirectory, "Schema", snapshot));
            await using var connection = new SqlConnection(ConnectionString);
            await connection.OpenAsync();
            foreach (var batch in Regex.Split(
                         script,
                         @"^\s*GO\s*\r?$",
                         RegexOptions.Multiline | RegexOptions.IgnoreCase))
            {
                if (!string.IsNullOrWhiteSpace(batch))
                    await ExecuteSqlAsync(connection, batch);
            }
        }

        private static async Task ExecuteSqlAsync(SqlConnection connection, string sql)
        {
            using var command = new SqlCommand(sql, connection);
            await command.ExecuteNonQueryAsync();
        }

        public async ValueTask DisposeAsync()
        {
            if (!created)
                return;

            var masterSettings = new SqlConnectionStringBuilder(ConnectionString)
            {
                InitialCatalog = "master"
            };
            await using var master = new SqlConnection(masterSettings.ConnectionString);
            await master.OpenAsync();
            await ExecuteSqlAsync(master,
                $"ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{name}];");
            created = false;
        }
    }
}
