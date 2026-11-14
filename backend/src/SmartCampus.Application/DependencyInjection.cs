using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
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

                // Outermost: tells after every transaction below has committed.
                config.AddOpenBehavior(typeof(TourChangeNotificationBehavior<,>));
                config.AddOpenBehavior(typeof(ValidationBehavior<,>));
                config.AddOpenBehavior(typeof(AccountTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(PoiMutationTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(RouteMutationTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(TourMutationTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(RegistrationTransactionBehavior<,>));
                config.AddOpenBehavior(typeof(UnitOfWorkBehavior<,>));
            });

            services.AddValidatorsFromAssembly(assembly);
            // Api replaces this with the /hubs/operations broadcaster.
            services.TryAddSingleton<SmartCampus.Application.Common.Abstractions.Tours.ITourChangeNotifier,
                SmartCampus.Application.Common.Abstractions.Tours.NoTourChangeNotifier>();
            services.AddScoped<SmartCampus.Application.Features.Invitations.InvitationIssuer>();
            services.AddScoped<SmartCampus.Application.Features.Tours.TourStartPreflight>();
            services.AddSingleton<SmartCampus.Application.Features.StudentQuestions.StudentQuestionGate>();
            services.AddSingleton<SmartCampus.Application.Features.Invitations.InvitationCodeGuard>();
            services.AddSingleton<SmartCampus.Application.Features.Auth.LoginAttemptGate>();

            return services;
        }
    }
}
