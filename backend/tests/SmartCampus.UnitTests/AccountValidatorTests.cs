using SmartCampus.Application.Features.Accounts.Commands.CreateAccount;
using SmartCampus.Application.Features.Accounts.Commands.CreateAccount.Dtos;
using SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;
using SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;

namespace SmartCampus.UnitTests;

public sealed class AccountValidatorTests
{
    [Theory]
    [InlineData(" staff")]
    [InlineData("staff ")]
    [InlineData("staff user")]
    [InlineData("staff\tuser")]
    [InlineData("staff\nuser")]
    [InlineData("staff\u00a0user")]
    [InlineData("staff\u0085user")]
    public void CreateAccountValidator_RejectsWhitespaceInUsername(string username)
    {
        var command = new CreateAccountCommand(
            Guid.NewGuid(), new CreateAccountRequest(username, "Staff User", "Staff", " password "));

        var result = new CreateAccountCommandValidator().Validate(command);

        var failure = Assert.Single(result.Errors);
        Assert.Equal(nameof(CreateAccountRequest.Username), failure.PropertyName);
        Assert.Equal("Username must not contain whitespace.", failure.ErrorMessage);
    }

    [Fact]
    public void CreateAccountValidator_RequiresFieldsAndActor()
    {
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(
            Guid.Empty,
            new CreateAccountRequest(string.Empty, string.Empty, string.Empty, string.Empty));

        var result = validator.Validate(command);

        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(CreateAccountRequest.Username));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(CreateAccountRequest.FullName));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(CreateAccountRequest.Role));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(CreateAccountRequest.InitialPassword));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(command.ActorId));
    }

    [Fact]
    public void CreateAccountValidator_EnforcesPersistedLengthLimits()
    {
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(
            Guid.NewGuid(),
            new CreateAccountRequest(
                new string('u', 101),
                new string('n', 151),
                "Staff",
                "valid initial password"));

        var result = validator.Validate(command);

        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(CreateAccountRequest.Username));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(CreateAccountRequest.FullName));
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Student")]
    [InlineData("Visitor")]
    [InlineData("STAFF,Representative")]
    public void CreateAccountValidator_RejectsUnsupportedRoles(string role)
    {
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(
            Guid.NewGuid(),
            new CreateAccountRequest("valid.user", "Valid User", role, "valid initial password"));

        var result = validator.Validate(command);

        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(CreateAccountRequest.Role));
    }

    [Theory]
    [InlineData("Staff")]
    [InlineData("Representative")]
    [InlineData("staff")]
    public void CreateAccountValidator_AcceptsSupportedRoles(string role)
    {
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(
            Guid.NewGuid(),
            new CreateAccountRequest("valid.user", "Valid User", role, "valid initial password"));

        Assert.True(validator.Validate(command).IsValid);
    }

    [Theory]
    [InlineData(0, 20)]
    [InlineData(1, 0)]
    [InlineData(1, 101)]
    public void GetAccountsValidator_EnforcesPaginationBounds(int page, int pageSize)
    {
        var validator = new GetAccountsQueryValidator();

        Assert.False(validator.Validate(
            new GetAccountsQuery(new GetAccountsRequest(null, null, page, pageSize))).IsValid);
    }

    [Fact]
    public void GetAccountsValidator_AcceptsBoundaryValues()
    {
        var validator = new GetAccountsQueryValidator();

        Assert.True(validator.Validate(new GetAccountsQuery(new GetAccountsRequest(null, null, 1, 100))).IsValid);
    }

    [Theory]
    [InlineData("unknown")]
    [InlineData("passwordHash")]
    [InlineData("-username,createdAt")]
    [InlineData("--username")]
    [InlineData("+username")]
    public void GetAccountsValidator_RejectsUnsupportedSort(string sort)
    {
        var result = new GetAccountsQueryValidator()
            .Validate(new GetAccountsQuery(new GetAccountsRequest(null, sort)));

        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(GetAccountsRequest.Sort));
    }

    [Theory]
    [InlineData("username", AccountSortField.Username, false)]
    [InlineData("-fullName", AccountSortField.FullName, true)]
    [InlineData("role", AccountSortField.Role, false)]
    [InlineData("isActive", AccountSortField.IsActive, false)]
    [InlineData("createdAt", AccountSortField.CreatedAt, false)]
    [InlineData("-updatedAt", AccountSortField.UpdatedAt, true)]
    public void GetAccountsSortParser_ParsesWhitelistedFields(
        string input,
        AccountSortField field,
        bool descending)
    {
        Assert.True(AccountSortParser.TryParse(input, out var sort));
        Assert.Equal(new AccountSort(field, descending), sort);
    }

    [Fact]
    public void GetAccountsSortParser_UsesDeterministicDefault()
    {
        Assert.True(AccountSortParser.TryParse("  ", out var sort));
        Assert.Equal(AccountSort.Default, sort);
        Assert.Equal(AccountSortField.CreatedAt, sort.Field);
        Assert.False(sort.Descending);
    }

    [Fact]
    public void LifecycleValidators_RequireAccountAndActorIds()
    {
        var deactivateResult = new DeactivateAccountCommandValidator()
            .Validate(new DeactivateAccountCommand(Guid.Empty, Guid.Empty));
        var reactivateResult = new ReactivateAccountCommandValidator()
            .Validate(new ReactivateAccountCommand(Guid.Empty, Guid.Empty));

        Assert.Equal(2, deactivateResult.Errors.Count);
        Assert.Equal(2, reactivateResult.Errors.Count);
    }
}
