using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;

public sealed class DeactivateAccountCommandHandler(
    IAccountRepository accountRepository,
    TimeProvider timeProvider)
    : IRequestHandler<DeactivateAccountCommand, Unit>
{
    public async Task<Unit> Handle(
        DeactivateAccountCommand request,
        CancellationToken cancellationToken)
    {
        var user = await accountRepository.FindForManagementAsync(request.Id, cancellationToken)
            ?? throw new NotFoundException("Account was not found.");

        AccountRoles.EnsureManaged(user.UserRoles.Select(userRole => userRole.Role));
        if (!user.IsActive)
            return Unit.Value;

        var now = timeProvider.GetUtcNow();
        user.IsActive = false;
        user.UpdatedAt = now;
        foreach (var refreshToken in user.RefreshTokens.Where(token =>
                     token.RevokedAt is null && token.ExpiresAt > now))
        {
            refreshToken.RevokedAt = now;
        }

        accountRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = request.ActorUserId,
            Action = "ACCOUNT_DEACTIVATED",
            EntityType = "User",
            EntityId = user.Id.ToString("D"),
            OccurredAt = now
        });

        return Unit.Value;
    }
}
