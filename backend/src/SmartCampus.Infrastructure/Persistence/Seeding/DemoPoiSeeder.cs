using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Seeding;

public sealed record DemoPoiSeedResult(int Created, int Skipped);

public sealed class DemoPoiSeeder(ApplicationDbContext dbContext)
{
    public const string DatabaseName = "SmartCampusTourPoiDemo";

    public async Task<DemoPoiSeedResult> SeedAsync(
        string environmentName,
        CancellationToken cancellationToken = default)
    {
        if (!string.Equals(environmentName, "Development", StringComparison.OrdinalIgnoreCase))
            throw new DemoPoiSeedException("Demo POIs require the Development environment.");

        ValidateDatabaseName(dbContext.Database.GetDbConnection().Database);
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        // Check the connected database as well as the configured catalog before any DML.
        var actualDatabase = await dbContext.Database
            .SqlQueryRaw<string>("SELECT DB_NAME() AS [Value]")
            .SingleAsync(cancellationToken);
        ValidateDatabaseName(actualDatabase);

        // Serialize explicit seed commands across processes; the lock is released on commit/rollback.
        await dbContext.Database.ExecuteSqlRawAsync("""
            DECLARE @result int;
            EXEC @result = sys.sp_getapplock
                @Resource = N'CampusTour.DemoPoiSeed.v1',
                @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
            IF @result < 0 THROW 51020, 'Could not acquire demo POI seed lock.', 1;
            """, cancellationToken);

        var fixtures = DemoPoiFixture.Create(DateTimeOffset.UtcNow);
        var ids = fixtures.Select(poi => poi.Id).ToArray();
        var existing = await dbContext.Pois.AsNoTracking()
            .Where(poi => ids.Contains(poi.Id) || poi.MapKey == DemoPoiFixture.MapKey)
            .ToListAsync(cancellationToken);
        var pending = new List<Poi>();
        foreach (var fixture in fixtures)
        {
            var sameId = existing.SingleOrDefault(poi => poi.Id == fixture.Id);
            if (sameId is not null && !SamePayload(sameId, fixture))
                throw new DemoPoiSeedException($"POI {fixture.Id} differs from the fixture; no data was overwritten.");

            if (existing.Any(poi => poi.Id != fixture.Id
                && string.Equals(poi.MapKey, fixture.MapKey, StringComparison.OrdinalIgnoreCase)
                && string.Equals(poi.Name.Trim(), fixture.Name.Trim(), StringComparison.OrdinalIgnoreCase)))
            {
                throw new DemoPoiSeedException($"Another POI uses the fixture name for {fixture.Id}; no data was merged.");
            }

            if (sameId is null)
                pending.Add(fixture);
        }

        dbContext.Pois.AddRange(pending);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new DemoPoiSeedResult(pending.Count, fixtures.Length - pending.Count);
    }

    private static void ValidateDatabaseName(string name)
    {
        var prefix = DatabaseName + "_";
        if (string.Equals(name, DatabaseName, StringComparison.Ordinal)
            || (name.StartsWith(prefix, StringComparison.Ordinal)
                && Guid.TryParseExact(name[prefix.Length..], "N", out _)))
            return;

        throw new DemoPoiSeedException(
            "Demo POIs require database SmartCampusTourPoiDemo or SmartCampusTourPoiDemo_<32-hex-guid>.");
    }

    private static bool SamePayload(Poi existing, Poi fixture) =>
        existing.Name == fixture.Name && existing.Description == fixture.Description
        && existing.MapKey == fixture.MapKey && existing.MapFrame == fixture.MapFrame
        && existing.X == fixture.X && existing.Y == fixture.Y && existing.Yaw == fixture.Yaw
        && existing.NarrationText == fixture.NarrationText && existing.AudioUrl == fixture.AudioUrl
        && existing.NarrationSeconds == fixture.NarrationSeconds
        && existing.FallbackVideoUrl == fixture.FallbackVideoUrl && existing.IsActive == fixture.IsActive;
}
