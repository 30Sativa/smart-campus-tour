using FluentValidation;
using SmartCampus.Application.Features.Accounts.Queries.GetAccounts.Dtos;

namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts;

public sealed class GetAccountsQueryValidator : AbstractValidator<GetAccountsQuery>
{
    public GetAccountsQueryValidator()
    {
        RuleFor(query => query.Request).NotNull();

        When(query => query.Request is not null, () =>
        {
            RuleFor(query => query.Request.Page)
                .GreaterThanOrEqualTo(1)
                .OverridePropertyName(nameof(GetAccountsRequest.Page));
            RuleFor(query => query.Request.Size)
                .InclusiveBetween(1, 100)
                .OverridePropertyName("PageSize");
            RuleFor(query => query.Request.Sort)
                .Must(sort => AccountSortParser.TryParse(sort, out _))
                .WithMessage("Sort must use a supported account field, optionally prefixed with '-'.")
                .OverridePropertyName(nameof(GetAccountsRequest.Sort));
        });
    }
}
