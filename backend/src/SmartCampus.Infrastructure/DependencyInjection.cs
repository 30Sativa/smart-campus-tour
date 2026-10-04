using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Infrastructure.Authentication.Jwt;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Authentication.Seeding;
using SmartCampus.Infrastructure.Authentication.UsernameNormalization;
using SmartCampus.Infrastructure.Persistence;
using SmartCampus.Infrastructure.Persistence.Repositories;
using SmartCampus.Infrastructure.Persistence.Seeding;

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
        services.AddSingleton<IAuthTokenService, JwtAuthTokenService>();
        services.AddSingleton<JwtTokenSettings>();
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<IAuthRepository, EfAuthRepository>();
        services.AddScoped<IAccountRepository, EfAccountRepository>();
        services.AddScoped<IPoiManagementRepository, EfPoiManagementRepository>();
        services.AddScoped<IPoiManagementTransaction, EfPoiManagementTransaction>();
        services.AddScoped<InitialAdminSeeder>();
        services.AddScoped<DemoPoiSeeder>();

        return services;
    }
}
