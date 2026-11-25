using SmartCampus.Application.Features.Simulation;

namespace SmartCampus.Api.Hubs;

public static class SimulationPreviewExtensions
{
    private const string CorsPolicyName = "SimulationPreview";
    private const string HubPath = "/hubs/simulation";

    private static readonly string[] AllowedOrigins =
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ];

    public static IServiceCollection AddSimulationPreview(this IServiceCollection services)
    {
        services.AddSignalR();
        services.AddSingleton<SimulationBroadcaster>();
        services.AddSingleton<ISimulationPosePublisher>(provider =>
            provider.GetRequiredService<SimulationBroadcaster>());
        services.AddCors(options => options.AddPolicy(CorsPolicyName, policy =>
            policy.WithOrigins(AllowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials()));

        return services;
    }

    // Preview skips Infrastructure (no database), so Development's build-time check would reject
    // every DB-backed handler. Those handlers stay unavailable in preview and fail per request instead.
    public static IHostBuilder UseSimulationPreviewServiceValidation(this IHostBuilder host, bool enabled) =>
        enabled
            ? host.UseDefaultServiceProvider(options =>
            {
                options.ValidateOnBuild = false;
                options.ValidateScopes = true;
            })
            : host;

    public static WebApplication UseSimulationPreview(
        this WebApplication app,
        bool enabled)
    {
        app.Use(async (context, next) =>
        {
            var isIngestion = context.Request.Path.StartsWithSegments("/api/simulation");
            var isPreviewRequest = isIngestion ||
                context.Request.Path.StartsWithSegments(HubPath);

            if (isPreviewRequest)
            {
                if (!SimulationPreviewAccess.IsAllowed(
                        enabled,
                        app.Environment.IsDevelopment(),
                        isIngestion,
                        context.Connection.RemoteIpAddress))
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }

                var origin = context.Request.Headers.Origin.ToString();
                if (origin.Length > 0 && !AllowedOrigins.Contains(
                        origin,
                        StringComparer.OrdinalIgnoreCase))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return;
                }
            }

            await next(context);
        });

        app.UseCors(CorsPolicyName);

        // Preview is opt-in and development-only; production telemetry uses a separate fleet contract.
        if (enabled)
            app.MapHub<SimulationHub>(HubPath);

        return app;
    }
}
