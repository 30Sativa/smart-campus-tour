using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Common.Behaviors;

public sealed class PoiMutationTransactionBehavior<TRequest, TResponse>(
    IServiceProvider serviceProvider)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (request is not IPoiMutationCommand<TResponse>)
            return await next();

        var transaction = serviceProvider.GetRequiredService<IPoiManagementTransaction>();
        await using var scope = await transaction.BeginAsync(cancellationToken);
        var response = await next();
        await scope.CommitAsync(cancellationToken);
        return response;
    }
}
