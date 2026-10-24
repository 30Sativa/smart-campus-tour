using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Persistence.Seeding;

namespace SmartCampus.IntegrationTests;

public sealed class RepresentativeDemoFixtureTests
{
    [SchemaV11Fact]
    public async Task ExplicitDemoFixture_CreatesOnlyPreparedScheduledTour_AndNeverOverwrites()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync(demo: true);
        await database.InsertUserAsync(true, username: "rep.demo.admin", roles: ["ADMIN"]);
        await using var context = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer(database.ConnectionString).Options);
        await new DemoPoiSeeder(context).SeedAsync("Development");
        var sql = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Schema", "representative-demo.sql"));
        await database.ExecuteAsync(sql);
        var tour = await context.Tours.AsNoTracking().SingleAsync();
        Assert.Equal("SCHEDULED", tour.State);
        Assert.False(tour.IsHeld);
        Assert.Null(tour.AssignedRobotId);
        Assert.Equal(1, await context.Routes.CountAsync());
        Assert.Equal(2, await context.RouteStops.CountAsync());
        Assert.Equal(0, await context.GroupRegistrations.CountAsync());
        Assert.Equal(0, await context.Invitations.CountAsync());
        Assert.Equal(0, await context.Robots.CountAsync());
        var error = await Assert.ThrowsAsync<SqlException>(() => database.ExecuteAsync(sql));
        Assert.Equal(51034, error.Number);
        Assert.Equal(tour.RowVersion, (await context.Tours.AsNoTracking().SingleAsync()).RowVersion);
    }

    [SchemaV11Fact]
    public async Task ExplicitDemoFixture_RefusesANonDemoDatabaseBeforeDml()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var sql = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Schema", "representative-demo.sql"));
        var error = await Assert.ThrowsAsync<SqlException>(() => database.ExecuteAsync(sql));
        Assert.Equal(51030, error.Number);
        Assert.Equal(0, await database.CountRowsAsync("dbo.Routes"));
        Assert.Equal(0, await database.CountRowsAsync("dbo.Tours"));
    }
}
