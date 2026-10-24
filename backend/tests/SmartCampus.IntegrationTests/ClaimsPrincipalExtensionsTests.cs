using System.Security.Claims;
using SmartCampus.Api.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.IntegrationTests;

public sealed class ClaimsPrincipalExtensionsTests
{
    [Fact]
    public void GetRequiredUserId_ReturnsSubjectGuid()
    {
        var userId = Guid.NewGuid();
        var user = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("sub", userId.ToString("D")),
            new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString("D"))
        ], "Bearer"));

        Assert.Equal(userId, user.GetRequiredUserId());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("invalid-user-id")]
    public void GetRequiredUserId_MissingOrInvalidSubjectThrowsUnauthorized(string? subject)
    {
        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString("D"))], "Bearer");
        if (subject is not null)
            identity.AddClaim(new Claim("sub", subject));
        var user = new ClaimsPrincipal(identity);

        var exception = Assert.Throws<UnauthorizedException>(() => user.GetRequiredUserId());

        Assert.Equal("A valid account identity is required.", exception.Message);
    }
}
