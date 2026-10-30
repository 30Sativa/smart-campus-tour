using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Infrastructure.Authentication.Jwt;
using SmartCampus.Infrastructure.Authentication;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Authentication.Seeding;
using SmartCampus.Infrastructure.Authentication.UsernameNormalization;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Persistence.Repositories;
using SmartCampus.Infrastructure.Persistence.Seeding;
using SmartCampus.Infrastructure.Integrations.FleetSync;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Infrastructure.Integrations.Invitations;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;

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
        services.AddScoped<IRouteManagementRepository, EfRouteManagementRepository>();
        services.AddScoped<IRouteRevisionRepository, EfRouteRevisionRepository>();
        services.AddScoped<IRouteManagementTransaction, EfRouteManagementTransaction>();
        services.AddScoped<ITourManagementRepository, EfTourManagementRepository>();
        services.AddSingleton(_ => new TourScheduleSettings(configuration.GetSection("Tours:StartSlots").Get<string[]>()));

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
        services.AddSingleton<IInvitationCodeService, InvitationCodeService>();
        services.AddScoped<IInvitationRepository, EfInvitationRepository>();
        services.AddScoped<IStudentAccessRepository, EfStudentAccessRepository>();
        services.AddScoped<IStudentTourViewReader, EfStudentTourViewReader>();
        services.AddScoped<InitialAdminSeeder>();
        services.AddScoped<DemoPoiSeeder>();

        return services;
    }
}
