using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Authentication.Seeding;

public enum InitialAdminSeedResult
{
    Created,
    Skipped
}

public sealed class InitialAdminSeeder(
    ApplicationDbContext dbContext,
    IPasswordHasher passwordHasher,
    IUsernameNormalizer usernameNormalizer)
{
    private const string AdminRole = "ADMIN";

    public async Task<InitialAdminSeedResult> SeedAsync(
        string username,
        string password,
        string fullName,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(username);
        ArgumentException.ThrowIfNullOrWhiteSpace(password);
        ArgumentException.ThrowIfNullOrWhiteSpace(fullName);
        if (username.Any(char.IsWhiteSpace))
            throw new ArgumentException("Initial Admin username must not contain whitespace.", nameof(username));

        var trimmedUsername = username.Trim();
        var trimmedFullName = fullName.Trim();
        var normalizedUsername = usernameNormalizer.Normalize(trimmedUsername);
        if (normalizedUsername.Length == 0)
            throw new ArgumentException("Initial Admin username must not be blank.", nameof(username));

        await using var transaction = await dbContext.Database
            .BeginTransactionAsync(cancellationToken);

        // Check both the stored normalized value and the canonical username so a
        // malformed legacy row is reported as a conflict instead of duplicated.
        var knownUsernames = await dbContext.Users
            .Select(user => new { user.Id, user.Username, user.NormalizedUsername })
            .ToListAsync(cancellationToken);
        var matchingUserIds = knownUsernames
            .Where(user =>
                string.Equals(user.NormalizedUsername, normalizedUsername, StringComparison.Ordinal)
                || string.Equals(
                    usernameNormalizer.Normalize(user.Username),
                    normalizedUsername,
                    StringComparison.Ordinal))
            .Select(user => user.Id)
            .Take(2)
            .ToArray();

        if (matchingUserIds.Length > 1)
            throw new InitialAdminSeedConflictException(
                "More than one account matches the configured Admin username.");

        if (matchingUserIds.Length == 1)
        {
            // Only the v1.0 Users columns: the seeder also runs on the shared user tables of older schemas,
            // which lack later columns such as AvatarUrl (v1.24).
            var existingUser = await dbContext.Users
                .Where(user => user.Id == matchingUserIds[0])
                .Select(user => new { user.Id, user.Username, user.NormalizedUsername, user.IsActive, user.FullName, user.PasswordHash })
                .SingleAsync(cancellationToken);

            if (!string.Equals(existingUser.NormalizedUsername, normalizedUsername, StringComparison.Ordinal)
                || !string.Equals(
                    usernameNormalizer.Normalize(existingUser.Username),
                    normalizedUsername,
                    StringComparison.Ordinal))
            {
                throw new InitialAdminSeedConflictException(
                    "The existing account has an inconsistent normalized username.");
            }

            if (!existingUser.IsActive)
                throw new InitialAdminSeedConflictException(
                    "The existing Admin account is inactive.");

            if (string.IsNullOrWhiteSpace(existingUser.FullName)
                || string.IsNullOrWhiteSpace(existingUser.PasswordHash))
            {
                throw new InitialAdminSeedConflictException(
                    "The existing account is missing required account data.");
            }

            var roles = await dbContext.UserRoles
                .Where(role => role.UserId == existingUser.Id)
                .Select(role => role.Role)
                .ToListAsync(cancellationToken);
            if (!roles.Contains(AdminRole, StringComparer.Ordinal))
                throw new InitialAdminSeedConflictException(
                    "The existing account does not have the ADMIN role.");

            await transaction.CommitAsync(cancellationToken);
            return InitialAdminSeedResult.Skipped;
        }

        if (!AccountPasswordPolicy.IsValid(password))
            throw new ArgumentException("Initial password must contain 12 to 128 characters.", nameof(password));
        var userId = Guid.NewGuid();
        var passwordHash = passwordHasher.Hash(password);
        var createdAt = DateTimeOffset.UtcNow;
        // Inserted with the v1.0 columns only, for the same reason as the read above.
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO dbo.Users (Id, Username, NormalizedUsername, PasswordHash, FullName, IsActive, CreatedAt)
            VALUES ({userId}, {trimmedUsername}, {normalizedUsername}, {passwordHash}, {trimmedFullName}, CAST(1 AS bit), {createdAt});
            """, cancellationToken);
        dbContext.UserRoles.Add(new UserRole { UserId = userId, Role = AdminRole });
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return InitialAdminSeedResult.Created;
    }
}
