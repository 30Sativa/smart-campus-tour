using SmartCampus.Application.Features.Auth.Commands.Login;

namespace SmartCampus.UnitTests;

public sealed class LoginValidatorTests
{
    [Theory]
    [InlineData(" staff")]
    [InlineData("staff ")]
    [InlineData("staff user")]
    [InlineData("staff\tuser")]
    [InlineData("staff\nuser")]
    [InlineData("staff\u00a0user")]
    [InlineData("staff\u0085user")]
    public void LoginValidator_RejectsWhitespaceInUsername(string username)
    {
        var result = new LoginCommandValidator().Validate(new LoginCommand(username, " password "));

        var failure = Assert.Single(result.Errors);
        Assert.Equal(nameof(LoginCommand.Username), failure.PropertyName);
        Assert.Equal("Username must not contain whitespace.", failure.ErrorMessage);
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(100, true)]
    [InlineData(101, false)]
    public void LoginValidator_EnforcesUsernameLengthAndAllowsPasswordWhitespace(int length, bool valid)
    {
        var result = new LoginCommandValidator().Validate(new LoginCommand(new string('u', length), " password "));

        Assert.Equal(valid, result.IsValid);
    }
}
