using MediatR;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Auth.Commands.Logout;

public sealed record LogoutCommand(string? RefreshToken) : ICommand<Unit>;

public sealed class LogoutCommandHandler(
    IAuthRepository authRepository,
    IAuthTokenService authTokenService,
    TimeProvider timeProvider)
    : IRequestHandler<LogoutCommand, Unit>
{
    public async Task<Unit> Handle(
        LogoutCommand request,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            var storedToken = await authRepository.FindRefreshTokenByHashAsync(
                authTokenService.HashRefreshToken(request.RefreshToken),
                cancellationToken);
            if (storedToken is not null && storedToken.RevokedAt is null)
                storedToken.RevokedAt = timeProvider.GetUtcNow();
        }

        return Unit.Value;
    }
}
