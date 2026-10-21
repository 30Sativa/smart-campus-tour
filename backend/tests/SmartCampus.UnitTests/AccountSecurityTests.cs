using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Auth;
using SmartCampus.Application.Features.Auth.Commands.Login;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;

namespace SmartCampus.UnitTests;

public sealed class AccountSecurityTests
{
    [Theory]
    [InlineData(1, false)]
    [InlineData(11, false)]
    [InlineData(12, true)]
    [InlineData(128, true)]
    [InlineData(129, false)]
    public void NewPasswordPolicy_IsSharedWithCreateValidator_ButNotLoginMinimum(int length, bool valid)
    {
        var password = new string('p', length);
        Assert.Equal(valid, AccountPasswordPolicy.IsValid(password));
        Assert.Equal(valid, new CreateAccountCommandValidator().Validate(new CreateAccountCommand(Guid.NewGuid(),
            new CreateAccountRequest("test.user", "Test", "Staff", password))).IsValid);
        Assert.Equal(length <= 128, new LoginCommandValidator().Validate(new LoginCommand("test.user", password)).IsValid);
        Assert.False(AccountPasswordPolicy.IsValid(new string(' ', 12)));
        Assert.True(AccountPasswordPolicy.IsValid("  a long passphrase  "));
    }

    [Fact]
    public void AccountBudget_ResetsWithoutPermanentLockout_AndSeparatesAccounts()
    {
        var clock = new Clock();
        var gate = new LoginAttemptGate(clock);
        for (var i = 0; i < LoginAttemptGate.AttemptsPerMinute; i++) gate.Enter("USER");
        Assert.Throws<TooManyRequestsException>(() => gate.Enter("USER"));
        gate.Enter("OTHER");
        clock.Now = clock.Now.AddMinutes(1);
        gate.Enter("USER");
    }

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
