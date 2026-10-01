using SmartCampus.Application.Common.Abstractions.Authentication;
using SmartCampus.Infrastructure.Authentication.Jwt;
using SmartCampus.Infrastructure.Authentication.PasswordHashing;
using SmartCampus.Infrastructure.Authentication.UsernameNormalization;

namespace SmartCampus.IntegrationTests;

public sealed class AuthenticationPrimitiveTests
{
    [Fact]
    public void IdentityPasswordHasher_HashesAndVerifiesPassword()
    {
        IPasswordHasher hasher = new IdentityPasswordHasher();
        const string password = "correct horse battery staple";

        var storedHash = hasher.Hash(password);

        Assert.NotEqual(password, storedHash);
        Assert.True(hasher.Verify(password, storedHash));
        Assert.False(hasher.Verify("incorrect password", storedHash));
    }

    [Fact]
    public void IdentityPasswordHasher_UsesRandomSaltForEachHash()
    {
        IPasswordHasher hasher = new IdentityPasswordHasher();
        const string password = "same input password";

        var firstHash = hasher.Hash(password);
        var secondHash = hasher.Hash(password);

        Assert.NotEqual(firstHash, secondHash);
        Assert.True(hasher.Verify(password, firstHash));
        Assert.True(hasher.Verify(password, secondHash));
    }

    [Fact]
    public void UsernameNormalizer_TrimsAndUsesInvariantUppercaseDeterministically()
    {
        IUsernameNormalizer normalizer = new InvariantUsernameNormalizer();

        var first = normalizer.Normalize("  thitr.Admin  ");
        var second = normalizer.Normalize("  thitr.Admin  ");

        Assert.Equal("THITR.ADMIN", first);
        Assert.Equal(first, second);
        Assert.Equal(first, normalizer.Normalize("thitr.admin"));
    }
}
