namespace SmartCampus.Api.Common.Requests
{
    public sealed class CollectionQueryParameters
    {
        public string? Search { get; init; }

        public string? Sort { get; init; }

        public int Page { get; init; } = 1;

        public int Size { get; init; } = 20;

        public string? Expand { get; init; }
    }
}
