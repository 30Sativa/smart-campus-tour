using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Authentication;

public interface IAuthRepository
{
    Task<User?> FindUserByNormalizedUsernameAsync(
        string normalizedUsername,
        CancellationToken cancellationToken = default);

    Task<RefreshToken?> FindRefreshTokenByHashAsync(
        byte[] tokenHash,
        CancellationToken cancellationToken = default);

    void AddRefreshToken(RefreshToken refreshToken);
}
