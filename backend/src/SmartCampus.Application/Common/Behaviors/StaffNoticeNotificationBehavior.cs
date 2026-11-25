using MediatR;
using SmartCampus.Application.Features.StaffNotifications;

namespace SmartCampus.Application.Common.Behaviors;

/// <summary>
/// Tells <see cref="IStaffNoticeNotifier"/> after a <see cref="IStaffNoticeCommand"/> succeeded. Registered outermost,
/// with the Tour notification behaviors, so it runs only after every transaction and UnitOfWork behavior has
/// committed; a failed or refused command tells nothing.
/// </summary>
public sealed class StaffNoticeNotificationBehavior<TRequest, TResponse>(IStaffNoticeNotifier notifier)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        var response = await next();
        if (request is IStaffNoticeCommand) notifier.StaffNoticesChanged();
        return response;
    }
}
