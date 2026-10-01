using FluentValidation;

namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts;

public sealed class GetAccountsQueryValidator : AbstractValidator<GetAccountsQuery>
{
    public GetAccountsQueryValidator()
    {
        RuleFor(query => query.Page).GreaterThanOrEqualTo(1);
        RuleFor(query => query.PageSize).InclusiveBetween(1, 100);
        RuleFor(query => query.Sort)
            .Must(sort => AccountSortParser.TryParse(sort, out _))
            .WithMessage("Sort must use a supported account field, optionally prefixed with '-'.");
        RuleFor(query => query.Expand)
            .Must(string.IsNullOrWhiteSpace)
            .WithMessage("Account expansion is not supported.");
    }
}
