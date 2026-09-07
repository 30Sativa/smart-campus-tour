using System;
using System.Collections.Generic;
using System.Text;
using MediatR;
namespace SmartCampus.Application.Common.Abstractions.Messaging
{
    public interface IQuery<out TResponse> : IRequest<TResponse>
    {
    }
}
