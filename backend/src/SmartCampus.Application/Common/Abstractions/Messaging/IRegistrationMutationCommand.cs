namespace SmartCampus.Application.Common.Abstractions.Messaging;

/// <summary>
/// Marks a writer whose handler, UnitOfWork save and audit must share the registration transaction.
/// Acquire the parent Tour lock before registration/roster/session writes; perform external delivery
/// only after the pipeline commits. This marker alone does not acquire locks or make HTTP atomic.
/// </summary>
public interface IRegistrationMutationCommand<out TResponse> : ICommand<TResponse> { }

