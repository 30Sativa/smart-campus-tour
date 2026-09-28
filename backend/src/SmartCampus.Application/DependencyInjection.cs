using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Behaviors;
using SmartCampus.Application.Features.RobotTelemetry;


namespace SmartCampus.Application
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddApplication(
            this IServiceCollection services)
        {
            var assembly = typeof(DependencyInjection).Assembly;

            services.AddMediatR(config =>
            {
                config.RegisterServicesFromAssembly(assembly);

                config.AddOpenBehavior(typeof(ValidationBehavior<,>));
                config.AddOpenBehavior(typeof(UnitOfWorkBehavior<,>));
            });

            services.AddValidatorsFromAssembly(assembly);

            // Robot pose telemetry: latest state per robot, in memory only.
            services.TryAddSingleton(TimeProvider.System);
            services.AddSingleton<IRobotTelemetryStore, RobotTelemetryStore>();

            return services;
        }
    }
}
