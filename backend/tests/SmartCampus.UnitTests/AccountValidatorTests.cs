using SmartCampus.Application.Features.Accounts.Commands.CreateAccount;
using SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;
using SmartCampus.Application.Features.Accounts.Commands.ReactivateAccount;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts;

namespace SmartCampus.UnitTests;

public sealed class AccountValidatorTests
{
    [Fact]
    public void CreateAccountValidator_RequiresFieldsAndActor()
    {
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(string.Empty, string.Empty, string.Empty, string.Empty, Guid.Empty);

        var result = validator.Validate(command);

        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(command.Username));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(command.FullName));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(command.Role));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(command.InitialPassword));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(command.ActorUserId));
    }

    [Fact]
    public void CreateAccountValidator_EnforcesPersistedLengthLimits()
    {
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(
            new string('u', 101),
            new string('n', 151),
            "Staff",
            "valid initial password",
            Guid.NewGuid());

        var result = validator.Validate(command);

        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(command.Username));
        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(command.FullName));
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
            "valid.user",
            "Valid User",
            role,
            "valid initial password",
            Guid.NewGuid());

        var result = validator.Validate(command);

        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(command.Role));
    }

    [Theory]
    [InlineData("Staff")]
    [InlineData("Representative")]
    [InlineData("staff")]
    public void CreateAccountValidator_AcceptsSupportedRoles(string role)
    {
        var validator = new CreateAccountCommandValidator();
        var command = new CreateAccountCommand(
            "valid.user",
            "Valid User",
            role,
            "valid initial password",
            Guid.NewGuid());

        Assert.True(validator.Validate(command).IsValid);
    }

    [Theory]
    [InlineData(0, 20)]
    [InlineData(1, 0)]
    [InlineData(1, 101)]
    public void GetAccountsValidator_EnforcesPaginationBounds(int page, int pageSize)
    {
        var validator = new GetAccountsQueryValidator();

        Assert.False(validator.Validate(new GetAccountsQuery(Page: page, PageSize: pageSize)).IsValid);
    }

    [Fact]
    public void GetAccountsValidator_AcceptsBoundaryValues()
    {
        var validator = new GetAccountsQueryValidator();

        Assert.True(validator.Validate(new GetAccountsQuery(Page: 1, PageSize: 100)).IsValid);
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
            .Validate(new GetAccountsQuery(Sort: sort));

        Assert.Contains(result.Errors, failure => failure.PropertyName == nameof(GetAccountsQuery.Sort));
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
