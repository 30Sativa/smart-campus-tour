using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Common.Behaviors;

/// <summary>
/// Wraps registration writers around the inner UnitOfWork behavior: handler, save, then commit.
/// Disposal without commit rolls back. Keep validation outside this behavior and external HTTP
/// delivery outside the transaction; a returned response is published only after commit succeeds.
/// </summary>
public sealed class RegistrationTransactionBehavior<TRequest, TResponse>(IServiceProvider services)
    : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        if (request is not IRegistrationMutationCommand<TResponse>) return await next();
        await using var scope = await services.GetRequiredService<IRegistrationTransaction>().BeginAsync(ct);
        var response = await next();
        await scope.CommitAsync(ct);
        return response;
    }
}

