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
                config.AddOpenBehavior(typeof(AccountTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(PoiMutationTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(RouteMutationTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(TourMutationTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(RegistrationTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(UnitOfWorkBehavior<,>));
            });

            services.AddValidatorsFromAssembly(assembly);
            services.AddScoped<SmartCampus.Application.Features.Invitations.InvitationIssuer>();
            services.AddScoped<SmartCampus.Application.Features.Tours.TourStartPreflight>();
            services.AddSingleton<SmartCampus.Application.Features.StudentQuestions.StudentQuestionGate>();
            services.AddSingleton<SmartCampus.Application.Features.Auth.LoginAttemptGate>();

            return services;
        }
    }
}
