using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Authentication;

namespace SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;

public sealed record ReactivateAccountCommand(Guid Id, Guid ActorUserId) : ICommand<Unit>, IAccountTransactionRequest;
