namespace SmartCampus.Application.Features.Accounts.Queries.GetAccounts;

public static class AccountSortParser
{
    public static bool TryParse(string? value, out AccountSort sort)
    {
        sort = AccountSort.Default;
        if (string.IsNullOrWhiteSpace(value))
            return true;

        var descending = value[0] == '-';
        var fieldName = descending ? value[1..] : value;
        if (fieldName.Length == 0 || fieldName.Contains(',') || fieldName[0] is '-' or '+')
            return false;

        var field = fieldName.ToLowerInvariant() switch
        {
            "username" => AccountSortField.Username,
            "fullname" => AccountSortField.FullName,
            "role" => AccountSortField.Role,
            "isactive" => AccountSortField.IsActive,
            "createdat" => AccountSortField.CreatedAt,
            "updatedat" => AccountSortField.UpdatedAt,
            _ => (AccountSortField?)null
        };

        if (field is null)
            return false;

        sort = new AccountSort(field.Value, descending);
        return true;
    }
}
