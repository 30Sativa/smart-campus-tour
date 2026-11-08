using System.Globalization;
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

        // Under the User root lock an Operator change also takes, so a new assignment cannot slip past this check.
        var usages = await accountRepository.ListAccountUsageAsync(user.Id, cancellationToken);
        if (usages.Count > 0)
            throw new ConflictException("Chưa vô hiệu hóa được vì tài khoản này còn được dùng ở các mục dưới đây.", "ACCOUNT_IN_USE",
                blockers: usages.Select(Blocker).ToArray());

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

    private static ConflictBlocker Blocker(AccountUsage usage)
    {
        var at = usage.ScheduledStartAt.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
        return usage.IsOperator
            ? new("TOUR_OPERATOR", $"Đang vận hành Tour {usage.TourName} lúc {at}. Staff cần đổi người vận hành hoặc huỷ Tour này trước.")
            : new("ACTIVE_REGISTRATION", $"Đoàn {usage.GroupName} còn đăng ký Tour {usage.TourName} lúc {at}. Đại diện cần huỷ đăng ký hoặc chờ Tour kết thúc.");
    }
}
