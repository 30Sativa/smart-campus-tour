using System.Diagnostics;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Persistence.Seeding;

namespace SmartCampus.IntegrationTests;

public sealed class DemoPoiSeederTests
{
    private static readonly Guid AiLabId = Guid.Parse("8fd832a5-7e3b-4e6d-a101-000000000001");

    [Theory]
    [InlineData("Production", "SmartCampusTourPoiDemo")]
    [InlineData("Staging", "SmartCampusTourPoiDemo")]
    [InlineData("Development", "SmartCampusTourV11")]
    [InlineData("Development", "SmartCampusTourPoiDemo_production")]
    [InlineData("Development", "SmartCampusTourPoiDemo_")]
    public async Task UnsafeTarget_IsRejectedBeforeOpeningConnection(string environment, string catalog)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer($"Server=unreachable.invalid;Database={catalog};Integrated Security=true")
            .Options;
        await using var context = new ApplicationDbContext(options);
        await Assert.ThrowsAsync<DemoPoiSeedException>(
            () => new DemoPoiSeeder(context).SeedAsync(environment));
    }

    [Theory]
    [InlineData("Production", "SmartCampusTourPoiDemo", false, "Development environment")]
    [InlineData("Development", "SmartCampusTourV11", false, "require database")]
    [InlineData("Development", "SmartCampusTourPoiDemo", true, "separately")]
    public async Task Command_RefusesUnsafeOrCombinedInvocationWithoutHttp(
        string environment, string catalog, bool combined, string message)
    {
        var arguments = combined ? new[] { "--seed-demo-pois", "--seed-initial-admin" } : ["--seed-demo-pois"];
        using var process = InitialAdminSeederTests.StartApiProcess(
            $"Server=unreachable.invalid;Database={catalog};Integrated Security=true",
            arguments, jwtSigningKey: null, environment: environment);
        var result = await ReadProcessAsync(process);
        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains(message, result.Output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Now listening on", result.Output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("unreachable.invalid", result.Output, StringComparison.OrdinalIgnoreCase);
    }

    [SchemaV11Fact]
    public async Task FirstSeed_CreatesOnlyFourPoisWithStableIdsAndExplicitDemoContext()
    {
        await using var database = await DemoDatabase.CreateAsync();
        Assert.Equal(new DemoPoiSeedResult(4, 0), await database.SeedAsync());
        var pois = await database.ReadPoisAsync();
        var expected = new[]
        {
            (Id: AiLabId, Name: "[DEMO] AI Lab", X: -1.5m, Y: -5.5m),
            (Id: Guid.Parse("8fd832a5-7e3b-4e6d-a101-000000000002"), Name: "[DEMO] Thư viện trung tâm", X: 4.8m, Y: -2.2m),
            (Id: Guid.Parse("8fd832a5-7e3b-4e6d-a101-000000000003"), Name: "[DEMO] Innovation Space", X: 3.5m, Y: 4.2m),
            (Id: Guid.Parse("8fd832a5-7e3b-4e6d-a101-000000000004"), Name: "[DEMO] Hội trường A", X: -3.5m, Y: 3.8m)
        };
        Assert.Equal(4, pois.Length);
        foreach (var fixture in expected)
        {
            var poi = Assert.Single(pois, poi => poi.Id == fixture.Id);
            Assert.Equal(fixture.Name, poi.Name);
            Assert.Equal(fixture.X, poi.X);
            Assert.Equal(fixture.Y, poi.Y);
            Assert.Equal(0m, poi.Yaw);
            Assert.Equal("demo-poi-baseline-v1", poi.MapKey);
            Assert.Equal("map", poi.MapFrame);
            Assert.Contains("chưa khảo sát", poi.Description);
            Assert.True(poi.IsActive);
            Assert.Null(poi.NarrationText);
            Assert.Null(poi.AudioUrl);
            Assert.Null(poi.NarrationSeconds);
            Assert.Null(poi.FallbackVideoUrl);
            Assert.Null(poi.UpdatedAt);
            Assert.Equal(TimeSpan.Zero, poi.CreatedAt.Offset);
        }
        Assert.Equal(0, await database.OtherRowCountAsync());
    }

    [SchemaV11Fact]
    public async Task Rerun_PreservesAllPayloadAndTimestamps()
    {
        await using var database = await DemoDatabase.CreateAsync();
        await database.SeedAsync();
        var before = JsonSerializer.Serialize(await database.ReadPoisAsync());
        Assert.Equal(new DemoPoiSeedResult(0, 4), await database.SeedAsync());
        Assert.Equal(before, JsonSerializer.Serialize(await database.ReadPoisAsync()));
    }

    [SchemaV11Fact]
    public async Task PartialFixture_OnlyInsertsMissingIdsAndPreservesExistingRows()
    {
        await using var database = await DemoDatabase.CreateAsync();
        await database.SeedAsync();
        await database.ExecuteAsync($"DELETE FROM dbo.Pois WHERE Id <> '{AiLabId}';");
        var before = JsonSerializer.Serialize(Assert.Single(await database.ReadPoisAsync()));
        Assert.Equal(new DemoPoiSeedResult(3, 1), await database.SeedAsync());
        Assert.Equal(before, JsonSerializer.Serialize(Assert.Single(await database.ReadPoisAsync(), poi => poi.Id == AiLabId)));
    }

    [SchemaV11Fact]
    public async Task DuplicateNormalizedNameWithAnotherId_IsConflictAndNeverMerged()
    {
        await using var database = await DemoDatabase.CreateAsync();
        await database.SeedAsync();
        await database.ExecuteAsync($"""
            UPDATE dbo.Pois SET Id=NEWID(), Name=N'  [demo] ai lab  ' WHERE Id='{AiLabId}';
            """);
        var before = JsonSerializer.Serialize(await database.ReadPoisAsync());
        await Assert.ThrowsAsync<DemoPoiSeedException>(() => database.SeedAsync());
        Assert.Equal(before, JsonSerializer.Serialize(await database.ReadPoisAsync()));
    }

    [SchemaV11Fact]
    public async Task ChangedPayload_IsConflictEvenWhenSomeFixtureRowsAreMissing()
    {
        await using var database = await DemoDatabase.CreateAsync();
        await database.SeedAsync();
        await database.ExecuteAsync($"""
            UPDATE dbo.Pois SET AudioUrl=N'approved-audio', IsActive=0 WHERE Id='{AiLabId}';
            DELETE FROM dbo.Pois WHERE Id <> '{AiLabId}';
            """);
        var before = JsonSerializer.Serialize(await database.ReadPoisAsync());
        await Assert.ThrowsAsync<DemoPoiSeedException>(() => database.SeedAsync());
        Assert.Equal(before, JsonSerializer.Serialize(await database.ReadPoisAsync()));
    }

    [SchemaV11Fact]
    public async Task UpdatedRealPose_KeepsRouteStopReferenceAndRerunNeverDowngradesIt()
    {
        await using var database = await DemoDatabase.CreateAsync();
        await database.SeedAsync();
        var routeId = Guid.NewGuid();
        var stopId = Guid.NewGuid();
        await using (var context = database.CreateContext())
        {
            context.Routes.Add(new Route
            {
                Id = routeId, Name = "Test route", MapKey = "demo-poi-baseline-v1", MapFrame = "map",
                StartX = 0, StartY = 0, StartYaw = 0, EndMode = "LAST_POI",
                IsActive = true, CreatedAt = DateTimeOffset.UtcNow
            });
            context.RouteStops.Add(new RouteStop
            {
                Id = stopId, RouteId = routeId, PoiId = AiLabId, StopOrder = 1,
                DwellSeconds = 30, HeadStepsJson = "[{\"preset\":\"FRONT\",\"holdSeconds\":30}]"
            });
            await context.SaveChangesAsync();
        }
        await database.ExecuteAsync($"""
            BEGIN TRANSACTION;
            UPDATE dbo.Pois SET MapKey=N'nvh-f6-v1', X=12.3456, Y=-9.8765, Yaw=1.570796,
                UpdatedAt=SYSUTCDATETIME() WHERE Id='{AiLabId}';
            UPDATE dbo.Routes SET MapKey=N'nvh-f6-v1', StartX=10, StartY=-8 WHERE Id='{routeId}';
            COMMIT;
            """);
        var before = JsonSerializer.Serialize(await database.ReadPoisAsync());
        await Assert.ThrowsAsync<DemoPoiSeedException>(() => database.SeedAsync());
        Assert.Equal(before, JsonSerializer.Serialize(await database.ReadPoisAsync()));
        await using var after = database.CreateContext();
        var stop = await after.RouteStops.Include(stop => stop.Poi).SingleAsync();
        Assert.Equal(stopId, stop.Id);
        Assert.Equal(routeId, stop.RouteId);
        Assert.Equal(AiLabId, stop.PoiId);
        Assert.Equal(12.3456m, stop.Poi.X);
        Assert.Equal(-9.8765m, stop.Poi.Y);
        Assert.Equal(1.570796m, stop.Poi.Yaw);
        Assert.NotNull(stop.Poi.UpdatedAt);
    }

    [SchemaV11Fact]
    public async Task InsertFailure_RollsBackEntireBatch()
    {
        await using var database = await DemoDatabase.CreateAsync();
        await database.ExecuteAsync("""
            CREATE TRIGGER dbo.FailDemoPoiInsert ON dbo.Pois AFTER INSERT AS
            BEGIN
                IF EXISTS (SELECT 1 FROM inserted WHERE Name=N'[DEMO] Hội trường A')
                    THROW 51021, 'Test-only POI insert failure.', 1;
            END;
            """);
        await Assert.ThrowsAsync<DbUpdateException>(() => database.SeedAsync());
        Assert.Empty(await database.ReadPoisAsync());
        Assert.Equal(0, await database.OtherRowCountAsync());
    }

    [SchemaV11Fact]
    public async Task ConcurrentSeeds_ProduceOneCreationAndOneSkip()
    {
        await using var database = await DemoDatabase.CreateAsync();
        var results = await Task.WhenAll(database.SeedAsync(), database.SeedAsync());
        Assert.Single(results, result => result == new DemoPoiSeedResult(4, 0));
        Assert.Single(results, result => result == new DemoPoiSeedResult(0, 4));
        Assert.Equal(4, (await database.ReadPoisAsync()).Length);
    }

    [SchemaV11Fact]
    public async Task Command_SeedsThenSkipsWithoutStartingHttpOrRequiringJwt()
    {
        await using var database = await DemoDatabase.CreateAsync();
        foreach (var expected in new[] { "created 4, skipped 0", "created 0, skipped 4" })
        {
            using var process = InitialAdminSeederTests.StartApiProcess(
                database.ConnectionString, ["--seed-demo-pois"], jwtSigningKey: null);
            var result = await ReadProcessAsync(process);
            Assert.Equal(0, result.ExitCode);
            Assert.Contains(expected, result.Output);
            Assert.DoesNotContain("Now listening on", result.Output, StringComparison.OrdinalIgnoreCase);
        }
        Assert.Equal(4, (await database.ReadPoisAsync()).Length);
        Assert.Equal(0, await database.OtherRowCountAsync());
    }

    [SchemaV11Fact]
    public async Task Command_ConflictReturnsNonzeroWithoutOverwriting()
    {
        await using var database = await DemoDatabase.CreateAsync();
        await database.SeedAsync();
        await database.ExecuteAsync($"UPDATE dbo.Pois SET X=99 WHERE Id='{AiLabId}';");
        using var process = InitialAdminSeederTests.StartApiProcess(
            database.ConnectionString, ["--seed-demo-pois"], jwtSigningKey: null);
        var result = await ReadProcessAsync(process);
        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("differs from the fixture", result.Output);
        Assert.Equal(99m, Assert.Single(await database.ReadPoisAsync(), poi => poi.Id == AiLabId).X);
    }

    [SchemaV11Fact]
    public async Task Command_InsertFailureReturnsNonzeroWithoutSqlDiagnostics()
    {
        await using var database = await DemoDatabase.CreateAsync();
        await database.ExecuteAsync("""
            CREATE TRIGGER dbo.FailDemoCommand ON dbo.Pois AFTER INSERT AS
            BEGIN
                THROW 51022, 'Private SQL diagnostic must not reach command output.', 1;
            END;
            """);
        using var process = InitialAdminSeederTests.StartApiProcess(
            database.ConnectionString, ["--seed-demo-pois"], jwtSigningKey: null);
        var result = await ReadProcessAsync(process);
        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("Demo POI seed failed", result.Output);
        Assert.DoesNotContain("Private SQL diagnostic", result.Output);
        Assert.DoesNotContain("Now listening on", result.Output, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(await database.ReadPoisAsync());
    }

    [SchemaV11Fact]
    public async Task NormalStartup_DoesNotSeedDemoDatabase()
    {
        await using var database = await DemoDatabase.CreateAsync();
        var port = InitialAdminSeederTests.GetFreePort();
        using var process = InitialAdminSeederTests.StartApiProcess(database.ConnectionString, [], port);
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) };
            var readyBy = DateTime.UtcNow.AddSeconds(15);
            HttpStatusCode? status = null;
            while (DateTime.UtcNow < readyBy && !process.HasExited)
            {
                try
                {
                    using var response = await client.GetAsync($"http://127.0.0.1:{port}/");
                    status = response.StatusCode;
                    break;
                }
                catch (HttpRequestException) { await Task.Delay(100); }
                catch (TaskCanceledException) { await Task.Delay(100); }
            }
            Assert.False(process.HasExited);
            Assert.NotNull(status);
            Assert.Empty(await database.ReadPoisAsync());
            Assert.Equal(0, await database.OtherRowCountAsync());
        }
        finally
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            _ = await output;
            _ = await error;
        }
    }

    private static async Task<(int ExitCode, string Output)> ReadProcessAsync(Process process)
    {
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException)
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            throw new TimeoutException("Demo POI command did not exit.");
        }
        return (process.ExitCode, await output + await error);
    }

    private sealed class DemoDatabase : IAsyncDisposable
    {
        private readonly string name = DemoPoiSeeder.DatabaseName + "_" + Guid.NewGuid().ToString("N");
        private readonly SqlConnectionStringBuilder settings = new(
            Environment.GetEnvironmentVariable("SMARTCAMPUS_SCHEMA_TEST_CONNECTION")!)
        { InitialCatalog = "master", Pooling = false };
        private bool created;
        public string ConnectionString => settings.ConnectionString;

        public static async Task<DemoDatabase> CreateAsync()
        {
            var database = new DemoDatabase();
            try
            {
                await database.ExecuteAsync($"CREATE DATABASE [{database.name}];");
                database.created = true;
                database.settings.InitialCatalog = database.name;
                var script = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Schema", "snapshot.sql"));
                foreach (var batch in Regex.Split(script, @"^\s*GO\s*\r?$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
                    if (!string.IsNullOrWhiteSpace(batch)) await database.ExecuteAsync(batch);
                return database;
            }
            catch { await database.DisposeAsync(); throw; }
        }

        public ApplicationDbContext CreateContext() => new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(ConnectionString).Options);

        public async Task<DemoPoiSeedResult> SeedAsync()
        {
            await using var context = CreateContext();
            return await new DemoPoiSeeder(context).SeedAsync("Development");
        }

        public async Task<Poi[]> ReadPoisAsync()
        {
            await using var context = CreateContext();
            return await context.Pois.AsNoTracking().OrderBy(poi => poi.Id).ToArrayAsync();
        }

        public async Task<int> OtherRowCountAsync()
        {
            await using var context = CreateContext();
            return await context.Database.SqlQueryRaw<int>("""
                SELECT CAST(SUM(p.rows) AS int) AS [Value] FROM sys.partitions p
                JOIN sys.tables t ON t.object_id=p.object_id
                WHERE p.index_id IN (0,1) AND t.name <> 'Pois'
                """).SingleAsync();
        }

        public async Task ExecuteAsync(string sql)
        {
            await using var connection = new SqlConnection(ConnectionString);
            await connection.OpenAsync();
            using var command = new SqlCommand(sql, connection);
            await command.ExecuteNonQueryAsync();
        }

        public async ValueTask DisposeAsync()
        {
            if (!created) return;
            // Only drop this helper's generated database, never the supplied Initial Catalog.
            settings.InitialCatalog = "master";
            await ExecuteAsync($"ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{name}];");
            created = false;
        }
    }
}
