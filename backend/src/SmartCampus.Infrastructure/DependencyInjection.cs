using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Infrastructure.Authentication.Jwt;
using SmartCampus.Infrastructure.Authentication;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Authentication.Seeding;
using SmartCampus.Infrastructure.Authentication.UsernameNormalization;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Persistence.Repositories;
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
            configuration.GetValue<int?>("FleetCommands:SweepIntervalSeconds") ?? 5,
            configuration.GetValue<int?>("FleetCommands:StartEarlyLimitMinutes") ?? 10));
        // ADR-0045: Operator head control. In memory per API instance, like the telemetry store.
        services.AddSingleton(new FleetHeadSettings(configuration.GetValue<bool?>("FleetHead:Enabled") ?? false,
            configuration.GetValue<int?>("FleetHead:MaxCommandAgeMs") ?? 1000,
            configuration.GetValue<int?>("FleetHead:JogTtlMs") ?? 600,
            configuration.GetValue<int?>("FleetHead:MaxWaitMs") ?? 1500,
            configuration.GetValue<int?>("FleetHead:RobotConnectedWithinMs") ?? 3000));
        services.AddSingleton<IHeadCommandChannel, InMemoryHeadCommandChannel>();
        services.AddScoped<ITourHeadControlReader, EfTourHeadControlReader>();
        services.AddSingleton<IAuthTokenService, JwtAuthTokenService>();
        services.AddSingleton<JwtTokenSettings>();
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<IAuthRepository, EfAuthRepository>();
        services.AddScoped<IAccountTransaction, EfAccountTransaction>();
        services.AddScoped<IAccountRepository, EfAccountRepository>();
        services.AddScoped<IPoiManagementRepository, EfPoiManagementRepository>();
        services.AddScoped<IPoiManagementTransaction, EfPoiManagementTransaction>();
        services.AddScoped<EfVersionedMapPoiRepository>();
        services.AddScoped<IMapPoiRequestLock>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
        services.AddScoped<IMapVersionRepository>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
        services.AddScoped<IPhysicalRobotRepository, EfPhysicalRobotRepository>();
        services.AddScoped<IPoiProposalRepository>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
        services.AddScoped<IPoiVerificationRepository>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
        services.AddScoped<IRobotLifecycleManager, EfRobotLifecycleManager>();
        services.AddScoped<IPoiImportRepository>(provider => provider.GetRequiredService<EfVersionedMapPoiRepository>());
        services.AddScoped<IRouteManagementRepository, EfRouteManagementRepository>();
        services.AddScoped<IRouteRevisionRepository, EfRouteRevisionRepository>();
        services.AddScoped<IRouteManagementTransaction, EfRouteManagementTransaction>();
        services.AddScoped<ITourManagementRepository, EfTourManagementRepository>();
        services.AddScoped<IScheduleBlockRepository, EfScheduleBlockRepository>();
        services.AddSingleton(_ => new MapPoiSettings(configuration.GetValue<decimal?>("Maps:PoiClearanceMeters")));
        services.AddSingleton(_ => new RouteRuleSettings(configuration.GetValue<int?>("Routes:MinStops"),
            configuration.GetValue<decimal?>("Routes:MinStopSeparationMeters")));
        services.AddSingleton(_ => new TourScheduleSettings(configuration.GetSection("Tours:Shifts").Get<TourShiftOption[]>(),
            configuration.GetValue<int?>("Tours:RecommendedMaxMinutes"), configuration.GetValue<int?>("Tours:MaxCapacity"),
            configuration.GetValue<int?>("Tours:ShortNoticeMinLeadMinutes")));

        services.AddScoped<IAuditLogReader, EfAuditLogReader>();
        services.AddScoped<ITourManagementTransaction, EfTourManagementTransaction>();
        services.AddScoped<IRepresentativeRepository, EfRepresentativeRepository>();
        services.AddScoped<IRegistrationRepository, EfRegistrationRepository>();
        services.AddScoped<IRegistrationReviewRepository, EfRegistrationReviewRepository>();
        services.AddScoped<IRosterEmailChangeRepository, EfRosterEmailChangeRepository>();
        services.AddScoped<IRegistrationTransaction, EfRegistrationTransaction>();
        var invitationConfiguration = new InvitationConfiguration(configuration);
        services.AddSingleton(invitationConfiguration);
        services.AddSingleton(invitationConfiguration.Settings);
        services.AddSingleton(new SmartCampus.Application.Features.Invitations.InvitationCodeGuardSettings(
            configuration.GetValue<int?>("Invitations:CodeGuard:MaxFailures") ?? 5,
            configuration.GetValue<int?>("Invitations:CodeGuard:WindowMinutes") ?? 10,
            configuration.GetValue<int?>("Invitations:CodeGuard:LockMinutes") ?? 15));
        services.AddSingleton<IInvitationCodeService, InvitationCodeService>();
        services.AddScoped<IInvitationRepository, EfInvitationRepository>();
        services.AddScoped<IStudentAccessRepository, EfStudentAccessRepository>();
        services.AddScoped<IStudentTourViewReader, EfStudentTourViewReader>();
        services.AddScoped<InitialAdminSeeder>();
        services.AddScoped<DemoPoiSeeder>();

        return services;
    }
}
