using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Authentication;
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
            var existingUser = await dbContext.Users
                .SingleAsync(user => user.Id == matchingUserIds[0], cancellationToken);

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

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = trimmedUsername,
            NormalizedUsername = normalizedUsername,
            PasswordHash = passwordHasher.Hash(password),
            FullName = trimmedFullName,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.Users.Add(user);
        dbContext.UserRoles.Add(new UserRole { UserId = user.Id, Role = AdminRole });
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return InitialAdminSeedResult.Created;
    }
}
