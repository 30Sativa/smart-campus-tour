using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;

public sealed class ReactivateAccountCommandHandler(
    IAccountRepository accountRepository,
    TimeProvider timeProvider)
    : IRequestHandler<ReactivateAccountCommand, Unit>
{
    public async Task<Unit> Handle(
        ReactivateAccountCommand request,
        CancellationToken cancellationToken)
    {
        var user = await accountRepository.FindForManagementAsync(request.Id, cancellationToken)
            ?? throw new NotFoundException("Account was not found.");

        AccountRoles.EnsureManaged(user.UserRoles.Select(userRole => userRole.Role));
        if (user.IsActive)
            return Unit.Value;

        var now = timeProvider.GetUtcNow();
        user.IsActive = true;
        user.UpdatedAt = now;

        accountRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = request.ActorUserId,
            Action = "ACCOUNT_REACTIVATED",
            EntityType = "User",
            EntityId = user.Id.ToString("D"),
            OccurredAt = now
        });

        return Unit.Value;
    }
}
