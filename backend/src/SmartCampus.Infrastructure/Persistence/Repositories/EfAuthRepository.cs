using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfAuthRepository(ApplicationDbContext dbContext) : IAuthRepository
{
    public Task<User?> FindUserByNormalizedUsernameAsync(
        string normalizedUsername,
        CancellationToken cancellationToken = default) =>
        dbContext.Users
            .Include(user => user.UserRoles)
            .AsNoTracking()
            .SingleOrDefaultAsync(
                user => user.NormalizedUsername == normalizedUsername,
                cancellationToken);

    public Task<User?> LockUserAsync(Guid userId, CancellationToken cancellationToken = default) =>
        dbContext.Users.FromSqlInterpolated($"SELECT * FROM dbo.Users WITH (UPDLOCK, ROWLOCK) WHERE Id = {userId}")
            .Include(user => user.UserRoles).SingleOrDefaultAsync(cancellationToken);

    public async Task<RefreshToken?> FindRefreshTokenByHashAsync(
        byte[] tokenHash,
        CancellationToken cancellationToken = default)
    {
        // Discover only the immutable owner first. Never acquire a token lock before its User root.
        var userId = await dbContext.RefreshTokens.AsNoTracking().Where(token => token.TokenHash == tokenHash)
            .Select(token => (Guid?)token.UserId).SingleOrDefaultAsync(cancellationToken);
        if (userId is null || await LockUserAsync(userId.Value, cancellationToken) is null) return null;
        return await dbContext.RefreshTokens
            .Include(token => token.User)
            .ThenInclude(user => user.UserRoles)
            .SingleOrDefaultAsync(token => token.TokenHash == tokenHash, cancellationToken);
    }

    public void AddRefreshToken(RefreshToken refreshToken) =>
        dbContext.RefreshTokens.Add(refreshToken);
}
