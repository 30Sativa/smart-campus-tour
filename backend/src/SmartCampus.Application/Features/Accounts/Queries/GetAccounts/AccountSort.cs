namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts;

public sealed record AccountSort(AccountSortField Field, bool Descending)
{
    public static AccountSort Default { get; } = new(AccountSortField.CreatedAt, false);
}
