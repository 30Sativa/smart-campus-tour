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
        services.AddSingleton(provider => CreateSettings(configuration,
            provider.GetRequiredService<Microsoft.Extensions.Logging.ILogger<FleetSyncSettings>>()));
        services.AddSingleton<FleetOperationsBroadcaster>();
        // Replaces the Infrastructure default, which has no hub to count.
        services.AddSingleton<HubOperatorConsolePresence>();
        services.AddSingleton<SmartCampus.Application.Common.Abstractions.FleetSync.IOperatorConsolePresence>(provider => provider.GetRequiredService<HubOperatorConsolePresence>());
        services.AddHostedService<FleetFreshnessMonitor>();
        // Replaces the Application default: Tour commands tell the consoles to re-read (TourUpdated).
        services.AddSingleton<TourChangeBroadcaster>();
        services.AddSingleton<SmartCampus.Application.Common.Abstractions.Tours.ITourChangeNotifier>(provider => provider.GetRequiredService<TourChangeBroadcaster>());
        services.AddHostedService(provider => provider.GetRequiredService<TourChangeBroadcaster>());
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

    private static FleetSyncSettings CreateSettings(IConfiguration configuration,
        Microsoft.Extensions.Logging.ILogger<FleetSyncSettings> logger)
    {
        if (configuration.GetSection("FleetSync:RobotContexts").Exists())
            logger.LogWarning("FleetSync:RobotContexts is deprecated and ignored; assign robot map contexts in the Technical Staff web console.");

        static TimeSpan ReadDuration(IConfiguration config, string key, int fallback)
        {
            var value = config.GetValue<int?>($"FleetSync:{key}") ?? fallback;
            if (value < 0 || (value == 0 && key != "MaximumFutureSkewSeconds"))
                throw new InvalidOperationException($"FleetSync:{key} must be positive.");
            return TimeSpan.FromSeconds(value);
        }

        return new FleetSyncSettings(
            ReadDuration(configuration, "MaximumReportAgeSeconds", 30),
            ReadDuration(configuration, "MaximumFutureSkewSeconds", 5),
            ReadDuration(configuration, "SyncFreshnessSeconds", 30),
            ReadDuration(configuration, "PoseFreshnessSeconds", 5),
            ReadDuration(configuration, "FreshnessBroadcastIntervalSeconds", 5),
            ReadDuration(configuration, "OperationsBroadcastTimeoutSeconds", 2),
            ReadDuration(configuration, "OperationsBroadcastRetryDelaySeconds", 1));
    }
}
