namespace SmartCampus.Application.Common.Abstractions.Messaging;

public interface ITourMutationCommand<out TResponse> : ICommand<TResponse>;
