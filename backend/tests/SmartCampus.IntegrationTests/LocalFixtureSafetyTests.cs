using System.Reflection;
using Microsoft.Data.SqlClient;

namespace SmartCampus.IntegrationTests;

public sealed class LocalFixtureSafetyTests
{
    [Theory]
    [InlineData("--reuse-student-ai-local", "Production", "localhost", "SmartCampusStudentAiLocal_00000000000000000000000000000000", "Development")]
    [InlineData("--reuse-student-ai-local", "Development", "unreachable.invalid", "SmartCampusStudentAiLocal_00000000000000000000000000000000", "local SQL Server")]
    [InlineData("--reuse-student-ai-local", "Development", "localhost", "SmartCampusTourV11", "generated database")]
    [InlineData("--reuse-registration-local", "Development", "localhost", "SmartCampusStudentAiLocal_00000000000000000000000000000000", "generated database")]
    public async Task ReuseValidatesIsolationAgainBeforeDatabaseAccess(string argument, string environment, string server, string database, string expected)
    {
        using var process = InitialAdminSeederTests.StartApiProcess(
            $"Server={server};Database={database};Integrated Security=true", [argument], environment: environment);
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try { await process.WaitForExitAsync(timeout.Token); }
        finally { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        var output = await stdout + await stderr;
        Assert.NotEqual(0, process.ExitCode);
        Assert.Contains(expected, output);
        Assert.DoesNotContain("Now listening on", output);
        Assert.DoesNotContain("unreachable.invalid", output);
    }

    [SchemaV11Fact]
    public async Task FailedSchemaSetup_RemovesOnlyItsGeneratedLocalDatabase()
    {
        var connection = new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION"))
        { InitialCatalog = "master", Pooling = false };
        await using var master = new SqlConnection(connection.ConnectionString);
        await master.OpenAsync();
        async Task<int> Count()
        {
            await using var count = new SqlCommand("SELECT COUNT(*) FROM sys.databases WHERE name LIKE 'SmartCampusStudentAiLocal[_]%';", master);
            return (int)(await count.ExecuteScalarAsync())!;
        }
        var before = await Count();
        var helper = Assembly.Load("SmartCampus.Api").GetType("SmartCampus.Api.LocalFixtureDatabase", throwOnError: true)!;
        var create = helper.GetMethod("CreateAsync", BindingFlags.Public | BindingFlags.Static)!;
        var task = (Task)create.Invoke(null, [connection, "SmartCampusStudentAiLocal_", "THROW 51099, 'Synthetic schema failure.', 1;"])!;
        Assert.Equal(51099, (await Assert.ThrowsAsync<SqlException>(() => task)).Number);
        Assert.Equal(before, await Count());
    }
}
