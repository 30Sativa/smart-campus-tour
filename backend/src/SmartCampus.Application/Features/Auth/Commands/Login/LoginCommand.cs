using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Auth.Commands.Login;

public sealed record LoginCommand(string Username, string Password) : ICommand<AuthSessionResult>, IAccountTransactionRequest;

public sealed class LoginCommandHandler(
    IAuthRepository authRepository,
    IPasswordHasher passwordHasher,
    IUsernameNormalizer usernameNormalizer,
    IAuthTokenService authTokenService,
    TimeProvider timeProvider,
    LoginAttemptGate attempts)
    : IRequestHandler<LoginCommand, AuthSessionResult>
{
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(7);

    public async Task<AuthSessionResult> Handle(
        LoginCommand request,
        CancellationToken cancellationToken)
    {
        var normalizedUsername = usernameNormalizer.Normalize(request.Username);
        attempts.Enter(normalizedUsername);
        var user = await authRepository.FindUserByNormalizedUsernameAsync(
            normalizedUsername,
            cancellationToken);

        if (user is null || !passwordHasher.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedException("Invalid username or password.");

        // Hash outside the root lock, then revalidate the current snapshot before issuing credentials.
        var current = await authRepository.LockUserAsync(user.Id, cancellationToken);
        if (current is null || current.PasswordHash != user.PasswordHash)
            throw new UnauthorizedException("Invalid username or password.");
        user = current;
        if (!user.IsActive)
            throw new ForbiddenException("Account cannot access the system.");

        var role = ApplicationRoles.Resolve(user.UserRoles.Select(userRole => userRole.Role));
        var now = timeProvider.GetUtcNow();
        var refreshToken = authTokenService.CreateRefreshToken();
        var refreshExpiresAt = now.Add(RefreshTokenLifetime);

        authRepository.AddRefreshToken(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = authTokenService.HashRefreshToken(refreshToken),
            CreatedAt = now,
            ExpiresAt = refreshExpiresAt
        });

        return new AuthSessionResult(
            user.Id,
            user.Username,
            role,
            authTokenService.IssueAccessToken(user.Id, role, now),
            refreshToken,
            refreshExpiresAt);
    }
}
