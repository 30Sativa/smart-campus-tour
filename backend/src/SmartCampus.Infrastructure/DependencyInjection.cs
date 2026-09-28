using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.RobotTelemetry;
using SmartCampus.Infrastructure.Authentication;
using SmartCampus.Infrastructure.Persistence.Repositories;
using SmartCampus.Infrastructure.Persistence;

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

        // Robot device credentials (Robots.CredentialHash) and the robot a RUNNING Tour shows.
        services.AddSingleton<RobotCredentialCache>();
        services.AddScoped<IRobotCredentialVerifier, DatabaseRobotCredentialVerifier>();
        services.AddScoped<ITourRobotResolver, TourRobotResolver>();

        return services;
    }
}
