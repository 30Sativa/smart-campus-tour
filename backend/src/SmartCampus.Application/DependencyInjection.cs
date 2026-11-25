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
                config.AddOpenBehavior(typeof(TourBallotNotificationBehavior<,>));
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
            // ADR-0065 addendum: a committed vote is pushed to the Staff consoles (BallotUpdated); Api replaces the default.
            services.TryAddSingleton<SmartCampus.Application.Features.Tours.ITourBallotNotifier,
                SmartCampus.Application.Features.Tours.NoTourBallotNotifier>();
            services.AddScoped<SmartCampus.Application.Features.Tours.TourBallotSignalQueue>();
            services.AddScoped<SmartCampus.Application.Features.Invitations.InvitationIssuer>();
            services.AddScoped<SmartCampus.Application.Features.Tours.TourStartPreflight>();
            services.AddSingleton<SmartCampus.Application.Features.StudentQuestions.StudentQuestionGate>();
            // ADR-0070: Tour talk is kept in memory, one backend instance.
            services.AddSingleton<SmartCampus.Application.Features.TourTalk.TourTalkStore>();
            services.AddSingleton<SmartCampus.Application.Features.Invitations.InvitationCodeGuard>();
            services.AddSingleton<SmartCampus.Application.Features.Auth.LoginAttemptGate>();

            return services;
        }
    }
}
