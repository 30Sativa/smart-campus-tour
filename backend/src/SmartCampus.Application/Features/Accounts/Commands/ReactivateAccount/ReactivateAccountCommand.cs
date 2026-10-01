using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;

public sealed record ReactivateAccountCommand(Guid Id, Guid ActorUserId) : ICommand<Unit>;
