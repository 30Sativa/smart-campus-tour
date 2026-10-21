using MediatR;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Abstractions.Authentication;

namespace SmartCampus.Application.Common.Behaviors;

public sealed class AccountTransactionBehavior<TRequest, TResponse>(IServiceProvider services)
    : IPipelineBehavior<TRequest, TResponse> where TRequest : notnull
{
    public Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct) =>
        request is IAccountTransactionRequest { RequiresAccountTransaction: true }
            ? services.GetRequiredService<IAccountTransaction>().ExecuteAsync(() => next(), ct)
            : next();
}
