using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.Pois;

public static class PoiSortParser
{
    public static bool TryParse(string? value, out PoiSort sort)
    {
        sort = PoiSort.Default;
        if (string.IsNullOrWhiteSpace(value))
            return true;

        var descending = value[0] == '-';
        var fieldName = descending ? value[1..] : value;
        if (fieldName.Length == 0 || fieldName.Contains(',') || fieldName[0] is '-' or '+')
            return false;

        var field = fieldName.ToLowerInvariant() switch
        {
            "name" => PoiSortField.Name,
            "isactive" => PoiSortField.IsActive,
            "createdat" => PoiSortField.CreatedAt,
            "updatedat" => PoiSortField.UpdatedAt,
            _ => (PoiSortField?)null
        };

        if (field is null)
            return false;

        sort = new PoiSort(field.Value, descending);
        return true;
    }
}
