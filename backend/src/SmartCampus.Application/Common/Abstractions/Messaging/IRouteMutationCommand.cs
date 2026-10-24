namespace SmartCampus.Application.Common.Abstractions.Messaging;

public interface IRouteMutationCommand<out TResponse> : ICommand<TResponse>;
