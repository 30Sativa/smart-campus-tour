using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;

namespace SmartCampus.Application.Features.Accounts.Commands.CreateAccount;

public sealed record CreateAccountCommand(
    Guid ActorId,
    CreateAccountRequest Request) : ICommand<CreateAccountResponse>, IAccountTransactionRequest;
