using MediatR;
using SmartCampus.Application.Features.Tours;

namespace SmartCampus.Application.Common.Behaviors;

/// <summary>
/// Hands the ballots a request queued to <see cref="ITourBallotNotifier"/> after the request succeeded. Registered
/// outermost, with <see cref="TourChangeNotificationBehavior{TRequest, TResponse}"/>, so it runs after every transaction
/// and UnitOfWork behavior has committed; on failure the queued ballots are dropped.
/// </summary>
public sealed class TourBallotNotificationBehavior<TRequest, TResponse>(TourBallotSignalQueue queue, ITourBallotNotifier notifier)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        TResponse response;
        try
        {
            response = await next();
        }
        catch
        {
            queue.Clear();
            throw;
        }
        foreach (var signal in queue.Drain()) notifier.BallotChanged(signal);
        return response;
    }
}
