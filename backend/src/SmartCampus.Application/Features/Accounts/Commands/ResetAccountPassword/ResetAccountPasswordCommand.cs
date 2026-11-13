using System.Text.Json.Serialization;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Accounts.Commands.ResetAccountPassword;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ResetAccountPasswordRequest(string NewPassword, string ExpectedRowVersion);

public sealed record ResetAccountPasswordCommand(Guid Id, Guid ActorUserId, ResetAccountPasswordRequest Request)
    : ICommand<Unit>, IAccountTransactionRequest;

public sealed class ResetAccountPasswordCommandValidator : AbstractValidator<ResetAccountPasswordCommand>
{
    public ResetAccountPasswordCommandValidator()
    {
        RuleFor(command => command.Id).NotEmpty();
        RuleFor(command => command.ActorUserId).NotEmpty();
        RuleFor(command => command.Request).NotNull();
        When(command => command.Request is not null, () =>
        {
            RuleFor(command => command.Request.NewPassword)
                .Must(AccountPasswordPolicy.IsValid)
                .WithMessage("New password must contain 12 to 128 characters and must not be blank.")
                .OverridePropertyName(nameof(ResetAccountPasswordRequest.NewPassword));
            RuleFor(command => command.Request.ExpectedRowVersion)
                .Must(AccountVersion.IsValid)
                .WithMessage("Expected row version is missing or malformed.")
                .OverridePropertyName(nameof(ResetAccountPasswordRequest.ExpectedRowVersion));
        });
    }
}

/// <summary>
/// Admin reset of a managed account's password (ADR-0058). Like a self-service change it revokes every
/// refresh token of the account; issued access tokens stay valid until they expire. The password is never
/// written to the audit row or returned.
/// </summary>
public sealed class ResetAccountPasswordCommandHandler(
    IAccountRepository accountRepository,
    IPasswordHasher passwordHasher,
    TimeProvider timeProvider)
    : IRequestHandler<ResetAccountPasswordCommand, Unit>
{
    public async Task<Unit> Handle(ResetAccountPasswordCommand request, CancellationToken cancellationToken)
    {
        var user = await accountRepository.FindForManagementAsync(request.Id, cancellationToken)
            ?? throw new NotFoundException("Account was not found.");

        AccountRoles.EnsureManaged(user.UserRoles.Select(userRole => userRole.Role));
        AccountVersion.EnsureCurrent(user.CreatedAt, user.UpdatedAt, request.Request.ExpectedRowVersion);

        var now = AccountVersion.NextStamp(timeProvider.GetUtcNow(), user.CreatedAt, user.UpdatedAt);
        user.PasswordHash = passwordHasher.Hash(request.Request.NewPassword);
        user.UpdatedAt = now;
        foreach (var token in user.RefreshTokens.Where(token => token.RevokedAt is null))
            token.RevokedAt = now;

        accountRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = request.ActorUserId,
            Action = "PASSWORD_RESET_BY_ADMIN",
            EntityType = "User",
            EntityId = user.Id.ToString("D"),
            OccurredAt = now
        });

        return Unit.Value;
    }
}
