namespace SmartCampus.Api.Common.Responses
{
    public sealed record PaginationMetadata(
        int Page,
        int PageSize,
        long TotalItems,
        int TotalPages);
}
