namespace SmartCampus.Api.Common.Responses
{
    public sealed class PagedResponse<T>
    : BaseResponse<IReadOnlyCollection<T>>
    {
        public required PaginationMetadata Pagination { get; init; }
    }
}
