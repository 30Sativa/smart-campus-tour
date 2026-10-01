using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Common.Authentication;

namespace SmartCampus.Application.Features.Auth.Refresh;

public sealed record RefreshSessionQuery(string? RefreshToken) : IQuery<AuthSessionResult>;

public sealed class RefreshSessionQueryHandler(
    IAuthRepository authRepository,
    IAuthTokenService authTokenService,
    TimeProvider timeProvider)
    : IRequestHandler<RefreshSessionQuery, AuthSessionResult>
{
    public async Task<AuthSessionResult> Handle(
        RefreshSessionQuery request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            throw new UnauthorizedException("A valid refresh token is required.");

        var storedToken = await authRepository.FindRefreshTokenByHashAsync(
            authTokenService.HashRefreshToken(request.RefreshToken),
            cancellationToken);
        var now = timeProvider.GetUtcNow();
        if (storedToken is null
            || storedToken.RevokedAt is not null
            || storedToken.ExpiresAt <= now)
        {
            throw new UnauthorizedException("A valid refresh token is required.");
        }

        var user = storedToken.User;
        if (!user.IsActive)
            throw new ForbiddenException("Account cannot access the system.");

        var role = ApplicationRoles.Resolve(user.UserRoles.Select(userRole => userRole.Role));
        return new AuthSessionResult(
            user.Id,
            user.Username,
            role,
            authTokenService.IssueAccessToken(user.Id, role, now),
            request.RefreshToken,
            storedToken.ExpiresAt);
    }
}
