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

    public Task<RefreshToken?> FindRefreshTokenByHashAsync(
        byte[] tokenHash,
        CancellationToken cancellationToken = default) =>
        dbContext.RefreshTokens
            .Include(token => token.User)
            .ThenInclude(user => user.UserRoles)
            .SingleOrDefaultAsync(token => token.TokenHash == tokenHash, cancellationToken);

    public void AddRefreshToken(RefreshToken refreshToken) =>
        dbContext.RefreshTokens.Add(refreshToken);
}
