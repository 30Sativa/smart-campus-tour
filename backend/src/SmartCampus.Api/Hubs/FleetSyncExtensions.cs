using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Configuration;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Features.FleetSync;

namespace SmartCampus.Api.Hubs;

public static class FleetSyncExtensions
{
    public const string FleetSyncHubPath = "/hubs/operations";

    public static IServiceCollection AddFleetSync(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSignalR();
        services.AddSingleton(CreateSettings(configuration));
        services.AddSingleton<FleetOperationsBroadcaster>();
        services.AddHostedService<FleetFreshnessMonitor>();
        services.AddAuthorization(options => options.AddPolicy(
            FleetOperationsAuthorization.StaffPolicy,
            policy => policy.RequireRole(ApplicationRoles.Staff)));
        services.AddAuthentication()
            .AddScheme<AuthenticationSchemeOptions, FleetRobotAuthenticationHandler>(
                FleetRobotAuthentication.Scheme, _ => { });
        return services;
    }

    public static void MapFleetOperations(this WebApplication app) =>
        app.MapHub<FleetOperationsHub>(FleetSyncHubPath, options =>
            options.CloseOnAuthenticationExpiration = true)
            .RequireAuthorization(FleetOperationsAuthorization.StaffPolicy);

    private static FleetSyncSettings CreateSettings(IConfiguration configuration)
    {
        var contexts = new Dictionary<string, FleetRobotMapContext>(StringComparer.Ordinal);
        foreach (var robot in configuration.GetSection("FleetSync:RobotContexts").GetChildren())
        {
            var mapKey = robot["MapKey"];
            var frameId = robot["FrameId"];
            if (string.IsNullOrWhiteSpace(robot.Key) || string.IsNullOrWhiteSpace(mapKey) || string.IsNullOrWhiteSpace(frameId))
                throw new InvalidOperationException("FleetSync robot contexts require a robot code, MapKey and FrameId.");
            contexts.Add(robot.Key, new FleetRobotMapContext(mapKey, frameId));
        }

        static TimeSpan ReadDuration(IConfiguration config, string key, int fallback)
        {
            var value = config.GetValue<int?>($"FleetSync:{key}") ?? fallback;
            if (value < 0 || (value == 0 && key != "MaximumFutureSkewSeconds"))
                throw new InvalidOperationException($"FleetSync:{key} must be positive.");
            return TimeSpan.FromSeconds(value);
        }

        return new FleetSyncSettings(contexts,
            ReadDuration(configuration, "MaximumReportAgeSeconds", 30),
            ReadDuration(configuration, "MaximumFutureSkewSeconds", 5),
            ReadDuration(configuration, "SyncFreshnessSeconds", 30),
            ReadDuration(configuration, "PoseFreshnessSeconds", 5),
            ReadDuration(configuration, "FreshnessBroadcastIntervalSeconds", 5),
            ReadDuration(configuration, "OperationsBroadcastTimeoutSeconds", 2),
            ReadDuration(configuration, "OperationsBroadcastRetryDelaySeconds", 1));
    }
}
