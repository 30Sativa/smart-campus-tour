using System.Text.Json.Serialization;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Auth;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Profile.Commands.ChangePassword;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record ChangePasswordCommand(Guid UserId, ChangePasswordRequest Request)
    : ICommand<Unit>, IAccountTransactionRequest;

public sealed class ChangePasswordCommandValidator : AbstractValidator<ChangePasswordCommand>
{
    public ChangePasswordCommandValidator()
    {
        RuleFor(command => command.UserId).NotEmpty();
        RuleFor(command => command.Request).NotNull();
        When(command => command.Request is not null, () =>
        {
            RuleFor(command => command.Request.CurrentPassword)
                .NotEmpty()
                .MaximumLength(AccountPasswordPolicy.MaximumLength * 4)
                .OverridePropertyName(nameof(ChangePasswordRequest.CurrentPassword));
            RuleFor(command => command.Request.NewPassword)
                .Must(AccountPasswordPolicy.IsValid)
                .WithMessage("New password must contain 12 to 128 characters and must not be blank.")
                .OverridePropertyName(nameof(ChangePasswordRequest.NewPassword));
        });
    }
}

/// <summary>
/// Policy: a successful change revokes every refresh token of the account, so each device must sign in
/// again with the new password. Already-issued access tokens stay valid until they expire (15 minutes).
/// </summary>
public sealed class ChangePasswordCommandHandler(
    IAccountRepository accountRepository,
    IPasswordHasher passwordHasher,
    LoginAttemptGate attempts,
    TimeProvider timeProvider)
    : IRequestHandler<ChangePasswordCommand, Unit>
{
    public async Task<Unit> Handle(ChangePasswordCommand request, CancellationToken cancellationToken)
    {
        // Same per-account budget as login: a stolen access token must not become a password oracle.
        attempts.Enter($"change-password:{request.UserId:N}");

        var user = await accountRepository.FindForManagementAsync(request.UserId, cancellationToken)
            ?? throw new UnauthorizedException("A valid account identity is required.");
        ProfileRules.EnsureUsable(user);

        if (!passwordHasher.Verify(request.Request.CurrentPassword, user.PasswordHash))
            throw Rejected(nameof(ChangePasswordRequest.CurrentPassword), "Current password is incorrect.");
        if (request.Request.NewPassword == request.Request.CurrentPassword)
            throw Rejected(nameof(ChangePasswordRequest.NewPassword), "New password must differ from the current password.");

        var now = timeProvider.GetUtcNow();
        user.PasswordHash = passwordHasher.Hash(request.Request.NewPassword);
        user.UpdatedAt = now;
        foreach (var token in user.RefreshTokens.Where(token => token.RevokedAt is null))
            token.RevokedAt = now;

        accountRepository.AddAuditLog(new AuditLog
        {
            ActorUserId = user.Id,
            Action = "PASSWORD_CHANGED",
            EntityType = "User",
            EntityId = user.Id.ToString("D"),
            OccurredAt = now
        });

        return Unit.Value;
    }

    private static ValidationException Rejected(string property, string message) =>
        new([new ValidationFailure(property, message)]);
}
