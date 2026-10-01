using System.Text.Json.Serialization;

namespace SmartCampus.Api.Common.Responses
{
    public sealed class PagedResponse<T>
    : BaseResponse<IReadOnlyCollection<T>>
    {
        [JsonPropertyOrder(3)]
        public required PaginationMetadata Pagination { get; init; }
    }
}
