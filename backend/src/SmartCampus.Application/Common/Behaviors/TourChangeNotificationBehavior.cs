using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Tours;

namespace SmartCampus.Application.Common.Behaviors;

/// <summary>
/// Tells <see cref="ITourChangeNotifier"/> after a Tours command succeeded. Registered first, so it wraps every
/// transaction and UnitOfWork behavior and runs only after their commit; a failed command tells nothing. Every
/// command under <c>Features.Tours.Commands</c> counts, including robot reports, so no handler has to remember it.
/// </summary>
public sealed class TourChangeNotificationBehavior<TRequest, TResponse>(ITourChangeNotifier notifier)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private const string TourCommands = "SmartCampus.Application.Features.Tours.Commands";

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        var response = await next();
        if (IsTourCommand(request)) notifier.TourChanged();
        return response;
    }

    internal static bool IsTourCommand(TRequest request) =>
        request is ICommand<TResponse> && request.GetType().Namespace?.StartsWith(TourCommands, StringComparison.Ordinal) == true;
}
