using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;

namespace SmartCampus.Application.Features.Accounts.Commands.CreateAccount;

public sealed record CreateAccountCommand(
    string Username,
    string FullName,
    string Role,
    string InitialPassword,
    Guid ActorUserId) : ICommand<CreateAccountResult>;
