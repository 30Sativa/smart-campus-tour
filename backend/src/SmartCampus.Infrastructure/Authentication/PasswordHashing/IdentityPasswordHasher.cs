using Microsoft.AspNetCore.Identity;
using SmartCampus.Application.Common.Abstractions.Authentication;

namespace SmartCampus.Infrastructure.Authentication.PasswordHashing;

public sealed class IdentityPasswordHasher : IPasswordHasher
{
    private static readonly object UserContext = new();
    private readonly PasswordHasher<object> passwordHasher = new();

    public string Hash(string password)
    {
        ArgumentException.ThrowIfNullOrEmpty(password);
        return passwordHasher.HashPassword(UserContext, password);
    }

    public bool Verify(string password, string storedHash)
    {
        ArgumentException.ThrowIfNullOrEmpty(password);
        ArgumentException.ThrowIfNullOrEmpty(storedHash);

        return passwordHasher.VerifyHashedPassword(UserContext, storedHash, password)
            != PasswordVerificationResult.Failed;
    }
}
