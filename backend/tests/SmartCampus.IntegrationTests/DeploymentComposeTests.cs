using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;

namespace SmartCampus.IntegrationTests;

// Compose configuration validation needs the CLI only, not a running Docker daemon.
public sealed class DockerComposeFactAttribute : FactAttribute
{
    public DockerComposeFactAttribute()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo("docker")
            {
                ArgumentList = { "compose", "version" },
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            })!;
            if (!process.WaitForExit(10_000))
            {
                process.Kill(entireProcessTree: true);
                Skip = "Docker Compose CLI did not respond.";
            }
            else if (process.ExitCode != 0)
                Skip = "Docker Compose CLI is not installed.";
        }
        catch (Win32Exception)
        {
            Skip = "Docker Compose CLI is not installed.";
        }
    }
}

public sealed class DeploymentComposeTests
{
    [DockerComposeFact]
    public async Task ResolvedStack_IsolatesDatabaseSecretsAndOneShotAdminCredentials()
    {
        using var fixture = new ComposeFixture();
        var result = await fixture.ResolveAsync();
        Assert.True(result.ExitCode == 0, result.Error);
        using var config = JsonDocument.Parse(result.Output);
        var services = config.RootElement.GetProperty("services");
        var api = services.GetProperty("api");
        var sql = services.GetProperty("sqlserver");
        var init = services.GetProperty("db-init");
        var seed = services.GetProperty("seed-admin");
        var apiEnvironment = api.GetProperty("environment");
        var connection = apiEnvironment.GetProperty("ConnectionStrings__DefaultConnection").GetString()!;

        Assert.Equal("campustour-backend:config-test", api.GetProperty("image").GetString());
        Assert.False(api.TryGetProperty("build", out _));
        Assert.Equal("campustour-db-init:config-test", init.GetProperty("image").GetString());
        Assert.False(init.TryGetProperty("build", out _));
        Assert.False(init.TryGetProperty("volumes", out _));
        Assert.Contains("User ID=smartcampus_api", connection);
        Assert.Contains(fixture.AppPassword, connection);
        Assert.DoesNotContain(fixture.SaPassword, api.GetRawText());
        Assert.False(apiEnvironment.TryGetProperty("InitialAdminSeed__Password", out _));
        Assert.False(apiEnvironment.TryGetProperty("MSSQL_SA_PASSWORD", out _));
        Assert.Equal("Production", apiEnvironment.GetProperty("ASPNETCORE_ENVIRONMENT").GetString());
        Assert.True(api.GetProperty("read_only").GetBoolean());
        Assert.Equal("536870912", api.GetProperty("mem_limit").GetString());
        Assert.Equal(0.75, api.GetProperty("cpus").GetDouble());
        Assert.Single(api.GetProperty("ports").EnumerateArray());
        Assert.False(sql.TryGetProperty("ports", out _));
        Assert.Equal("2684354560", sql.GetProperty("mem_limit").GetString());
        Assert.Equal(1.25, sql.GetProperty("cpus").GetDouble());
        Assert.Equal("2048", sql.GetProperty("environment").GetProperty("MSSQL_MEMORY_LIMIT_MB").GetString());
        Assert.Equal("201326592", init.GetProperty("mem_limit").GetString());
        Assert.Equal(0.25, init.GetProperty("cpus").GetDouble());
        Assert.Equal("service_completed_successfully",
            api.GetProperty("depends_on").GetProperty("db-init").GetProperty("condition").GetString());
        Assert.Equal("service_healthy",
            init.GetProperty("depends_on").GetProperty("sqlserver").GetProperty("condition").GetString());
        Assert.Equal("service_completed_successfully",
            seed.GetProperty("depends_on").GetProperty("db-init").GetProperty("condition").GetString());
        Assert.Equal("InternalTestAdminPassword123!",
            seed.GetProperty("environment").GetProperty("InitialAdminSeed__Password").GetString());
        Assert.False(seed.TryGetProperty("ports", out _));
        Assert.False(seed.TryGetProperty("volumes", out _));
        Assert.False(seed.TryGetProperty("env_file", out _));
        Assert.DoesNotContain("TLS", seed.GetRawText());
        Assert.DoesNotContain("Resend__ApiKey", seed.GetRawText());
        Assert.True(config.RootElement.GetProperty("networks").GetProperty("database").GetProperty("internal").GetBoolean());
        var healthcheck = api.GetProperty("healthcheck").GetProperty("test").EnumerateArray()
            .Select(value => value.GetString()).ToArray();
        Assert.Contains(healthcheck, value => value?.Contains("/health/ready", StringComparison.Ordinal) == true);

        var backupMount = sql.GetProperty("volumes").EnumerateArray()
            .Single(volume => volume.GetProperty("target").GetString() == "/var/opt/mssql/backup");
        Assert.Equal(
            NormalizePath(Path.Combine(fixture.Directory, "backups")),
            NormalizePath(backupMount.GetProperty("source").GetString()!));
    }

    [DockerComposeFact]
    public async Task MissingAppPassword_FailsBeforeStartingAnyContainer()
    {
        using var fixture = new ComposeFixture();
        var result = await fixture.ResolveAsync(missingAppPassword: true);
        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("SQL_APP_PASSWORD", result.Error);
    }

    [DockerComposeFact]
    public async Task MissingReleaseImages_FailsBeforeStartingAnyContainer()
    {
        using var fixture = new ComposeFixture();
        var result = await fixture.ResolveAsync(missingReleaseImages: true);
        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("BACKEND_IMAGE", result.Error);
    }

    private sealed class ComposeFixture : IDisposable
    {
        private readonly string directory = Path.Combine(Path.GetTempPath(), "campustour-compose-" + Guid.NewGuid().ToString("N"));
        private readonly string backend;
        public string Directory => directory;
        public string SaPassword { get; } = "Aa1!SAconfigurationtest12345678901234567890";
        public string AppPassword { get; } = "Aa1!APPconfigurationtest123456789012345678";

        public ComposeFixture()
        {
            backend = FindBackend();
            System.IO.Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(directory, "test.env"), "");
            File.WriteAllText(Path.Combine(directory, "api.env"), "Invitations__Enabled=false\nInvitations__EmailWorkerEnabled=false\n");
            File.WriteAllText(Path.Combine(directory, "cert.pem"), "configuration-only test certificate");
            File.WriteAllText(Path.Combine(directory, "key.pem"), "configuration-only test key");
            System.IO.Directory.CreateDirectory(Path.Combine(directory, "backups"));
        }

        public async Task<(int ExitCode, string Output, string Error)> ResolveAsync(
            bool missingAppPassword = false, bool missingReleaseImages = false)
        {
            var start = new ProcessStartInfo("docker")
            {
                WorkingDirectory = backend,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            foreach (var argument in new[] { "compose", "--env-file", Path.Combine(directory, "test.env"),
                         "-f", Path.Combine(backend, "docker-compose.yml"), "--profile", "tools", "config", "--format", "json" })
                start.ArgumentList.Add(argument);
            var environment = new Dictionary<string, string>
            {
                ["COMPOSE_PROJECT_NAME"] = "campustour-config-test",
                ["COMPOSE_OWNER"] = "a1b2c3d4e5f60718293a4b5c6d7e8f90",
                ["BACKEND_IMAGE"] = missingReleaseImages ? "" : "campustour-backend:config-test",
                ["DB_INIT_IMAGE"] = "campustour-db-init:config-test",
                ["SQLSERVER_IMAGE"] = "mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04",
                ["MSSQL_PID"] = "Express",
                ["MSSQL_MEMORY_LIMIT_MB"] = "2048",
                ["SQLSERVER_MEMORY_LIMIT"] = "2560m",
                ["API_MEMORY_LIMIT"] = "512m",
                ["SQL_SA_PASSWORD"] = SaPassword,
                ["SQL_APP_PASSWORD"] = missingAppPassword ? "" : AppPassword,
                ["JWT_SIGNING_KEY"] = "internal-configuration-test-key-32-bytes",
                ["API_HOST"] = "api.example.test",
                ["WEB_ORIGIN"] = "https://tour.example.test",
                ["API_HTTPS_PORT"] = "18443",
                ["API_BIND_IP"] = "127.0.0.1",
                ["API_ENV_FILE"] = Path.Combine(directory, "api.env"),
                ["TLS_CERT_PATH"] = Path.Combine(directory, "cert.pem"),
                ["TLS_KEY_PATH"] = Path.Combine(directory, "key.pem"),
                ["SQL_BACKUP_DIR"] = Path.Combine(directory, "backups"),
                ["INITIAL_ADMIN_USERNAME"] = "deployment.admin",
                ["INITIAL_ADMIN_PASSWORD"] = "InternalTestAdminPassword123!",
                ["INITIAL_ADMIN_FULL_NAME"] = "Deployment Test Admin"
            };
            foreach (var (key, value) in environment)
                start.Environment[key] = value;
            using var process = Process.Start(start)!;
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            try { await process.WaitForExitAsync(timeout.Token); }
            catch (OperationCanceledException) { process.Kill(entireProcessTree: true); throw; }
            return (process.ExitCode, await output, await error);
        }

        public void Dispose()
        {
            foreach (var name in new[] { "test.env", "api.env", "cert.pem", "key.pem" })
                File.Delete(Path.Combine(directory, name));
            System.IO.Directory.Delete(Path.Combine(directory, "backups"));
            System.IO.Directory.Delete(directory);
        }

        private static string FindBackend()
        {
            for (var current = new DirectoryInfo(AppContext.BaseDirectory); current is not null; current = current.Parent)
                if (File.Exists(Path.Combine(current.FullName, "SmartCampus.slnx")))
                    return current.FullName;
            throw new DirectoryNotFoundException("Cannot find backend/SmartCampus.slnx.");
        }
    }

    private static string NormalizePath(string path) => Path.GetFullPath(path)
        .Replace('\\', '/')
        .TrimEnd('/');
}
