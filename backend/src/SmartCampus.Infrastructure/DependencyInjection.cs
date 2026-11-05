using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Persistence;
<<<<<<< Updated upstream
=======
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.FleetHead;
>>>>>>> Stashed changes
using SmartCampus.Infrastructure.Authentication.Jwt;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Authentication.Seeding;
using SmartCampus.Infrastructure.Authentication.UsernameNormalization;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Persistence.Repositories;
<<<<<<< Updated upstream
=======
using SmartCampus.Infrastructure.Persistence.Seeding;
using SmartCampus.Infrastructure.Integrations.FleetSync;
using SmartCampus.Infrastructure.Integrations.FleetHead;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Infrastructure.Integrations.Invitations;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.FleetHead;
using SmartCampus.Application.Features.Infrastructure;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.RobotDiagnostics;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Infrastructure.Integrations.RobotDiagnostics;
using SmartCampus.Infrastructure.Services;
>>>>>>> Stashed changes

namespace SmartCampus.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                "Connection string 'DefaultConnection' is not configured.");

        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseSqlServer(connectionString));

        services.AddScoped<IApplicationDbContext>(serviceProvider =>
            serviceProvider.GetRequiredService<ApplicationDbContext>());
        services.AddSingleton<IPasswordHasher, IdentityPasswordHasher>();
        services.AddSingleton<IUsernameNormalizer, InvariantUsernameNormalizer>();
<<<<<<< Updated upstream
=======
        services.AddScoped<IFleetRobotAuthenticator, FleetRobotAuthenticator>();
        services.AddScoped<IFleetRobotConnectionConfirmationStore, EfFleetRobotConnectionConfirmationStore>();
        services.AddScoped<IRobotMapAssignmentManager, EfRobotMapAssignmentManager>();
        services.AddScoped<IPhysicalRobotCredentialManager, EfPhysicalRobotCredentialManager>();
        services.AddSingleton<IFleetTelemetryStore, InMemoryFleetTelemetryStore>();
        services.AddSingleton<IRobotDiagnosticsStore, InMemoryRobotDiagnosticsStore>();
        services.AddScoped<IInfrastructureMetricsCollector, InfrastructureMetricsCollector>();
        services.AddSingleton<IOperatorConsolePresence, UnavailableOperatorConsolePresence>();
        services.AddSingleton(new FleetCommandSettings(configuration.GetValue<bool?>("FleetCommands:Enabled") ?? false,
            configuration.GetValue<int?>("FleetCommands:MaxTelemetryAgeSeconds") ?? 2,
            configuration.GetValue<int?>("FleetCommands:StartLateLimitMinutes") ?? 15,
            configuration.GetValue<int?>("FleetCommands:AcceptWindowSeconds") ?? 30,
            configuration.GetValue<int?>("FleetCommands:LegResultTimeoutSeconds") ?? 600,
            configuration.GetValue<int?>("FleetCommands:SweepIntervalSeconds") ?? 5));
        // ADR-0045: Operator head control. In memory per API instance, like the telemetry store.
        services.AddSingleton(new FleetHeadSettings(configuration.GetValue<bool?>("FleetHead:Enabled") ?? false,
            configuration.GetValue<int?>("FleetHead:MaxCommandAgeMs") ?? 1000,
            configuration.GetValue<int?>("FleetHead:JogTtlMs") ?? 600,
            configuration.GetValue<int?>("FleetHead:MaxWaitMs") ?? 1500,
            configuration.GetValue<int?>("FleetHead:RobotConnectedWithinMs") ?? 3000));
        services.AddSingleton<IHeadCommandChannel, InMemoryHeadCommandChannel>();
        services.AddScoped<ITourHeadControlReader, EfTourHeadControlReader>();
>>>>>>> Stashed changes
        services.AddSingleton<IAuthTokenService, JwtAuthTokenService>();
        services.AddSingleton<JwtTokenSettings>();
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<IAuthRepository, EfAuthRepository>();
        services.AddScoped<IAccountRepository, EfAccountRepository>();
        services.AddScoped<InitialAdminSeeder>();

        return services;
    }
}
