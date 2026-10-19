using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Common.Behaviors;

public sealed class TourMutationTransactionBehavior<TRequest, TResponse>(IServiceProvider services)
    : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    public Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct) =>
        request is ITourMutationCommand<TResponse>
            ? services.GetRequiredService<ITourManagementTransaction>().ExecuteAsync(() => next(), ct)
            : next();
}
