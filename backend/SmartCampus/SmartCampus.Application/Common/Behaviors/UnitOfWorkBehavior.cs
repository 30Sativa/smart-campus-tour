using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using System;
using System.Collections.Generic;
using System.Text;

namespace SmartCampus.Application.Common.Behaviors
{
    public sealed class UnitOfWorkBehavior<TRequest, TResponse>(
    IApplicationDbContext dbContext)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
    {
        public async Task<TResponse> Handle(
            TRequest request,
            RequestHandlerDelegate<TResponse> next,
            CancellationToken cancellationToken)
        {
            if (request is not ICommand<TResponse>)
            {
                return await next();
            }

            var response = await next();

            await dbContext.SaveChangesAsync(cancellationToken);

            return response;
        }
    }
}
