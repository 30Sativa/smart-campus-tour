using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;

public sealed record DeactivateAccountCommand(Guid Id, Guid ActorUserId) : ICommand<Unit>;
