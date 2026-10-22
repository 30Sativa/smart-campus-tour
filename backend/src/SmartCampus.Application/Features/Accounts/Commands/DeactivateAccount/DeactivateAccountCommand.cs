using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Authentication;

namespace SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;

public sealed record DeactivateAccountCommand(Guid Id, Guid ActorUserId) : ICommand<Unit>, IAccountTransactionRequest;
