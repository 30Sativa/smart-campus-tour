using Microsoft.Extensions.DependencyInjection;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Behaviors;


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

            return services;
        }
    }
}
