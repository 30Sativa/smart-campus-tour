using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Authentication;

public interface IAuthRepository
{
    Task<User?> FindUserByNormalizedUsernameAsync(
        string normalizedUsername,
        CancellationToken cancellationToken = default);

    /// <summary>Re-reads the User and roles under the shared account root lock, held until transaction completion.</summary>
    Task<User?> LockUserAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Locks the owning User before loading the token; requires the account transaction boundary.</summary>
    Task<RefreshToken?> FindRefreshTokenByHashAsync(
        byte[] tokenHash,
        CancellationToken cancellationToken = default);

    void AddRefreshToken(RefreshToken refreshToken);
}
