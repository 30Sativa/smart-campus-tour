using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Persistence.Seeding;

namespace SmartCampus.Api;

internal sealed class DemoPoiSeedCommand
{
    private const string Command = "--seed-demo-pois";
    private readonly string[] hostArguments;

    private DemoPoiSeedCommand(bool requested, string[] hostArguments)
    {
        Requested = requested;
        this.hostArguments = hostArguments;
    }

    public bool Requested { get; }

    public static DemoPoiSeedCommand Parse(string[] args) => new(
        args.Contains(Command, StringComparer.Ordinal),
        args.Where(argument => !string.Equals(argument, Command, StringComparison.Ordinal)).ToArray());

    public string[] GetHostArguments() => hostArguments;

    public async Task<int> RunAsync(WebApplicationBuilder builder, bool initialAdminRequested)
    {
        if (initialAdminRequested)
        {
            Console.Error.WriteLine("Run --seed-demo-pois and --seed-initial-admin separately.");
            return 1;
        }
        if (!builder.Environment.IsDevelopment())
        {
            Console.Error.WriteLine("Demo POIs require the Development environment.");
            return 1;
        }

        // Keep SQL/provider diagnostics out of command output; report only controlled messages.
        builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.None);
        try
        {
            builder.Services.AddInfrastructure(builder.Configuration);
            await using var app = builder.Build();
            await using var scope = app.Services.CreateAsyncScope();
            var result = await scope.ServiceProvider.GetRequiredService<DemoPoiSeeder>()
                .SeedAsync(builder.Environment.EnvironmentName);
            Console.WriteLine($"Demo POIs: created {result.Created}, skipped {result.Skipped}. Unverified; no robot dispatch.");
            return 0;
        }
        catch (DemoPoiSeedException exception)
        {
            Console.Error.WriteLine($"Demo POI seed refused: {exception.Message}");
            return 1;
        }
        catch (Exception exception) when (exception is SqlException or DbUpdateException or InvalidOperationException)
        {
            Console.Error.WriteLine("Demo POI seed failed. Check the demo database, v1.1 schema and database permissions. Rerun to check matching rows; existing POIs are never overwritten.");
            return 1;
        }
    }
}
