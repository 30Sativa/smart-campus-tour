using System.Text.Json.Serialization;

namespace SmartCampus.Api.Common.Responses
{
    public class BaseResponse<T>
    {
        [JsonPropertyOrder(0)]
        public bool Success { get; init; }

        [JsonPropertyOrder(1)]
        public string? Message { get; init; }

        [JsonPropertyOrder(2)]
        public T? Data { get; init; }

        [JsonPropertyOrder(4)]
        public object? Errors { get; init; }
    }
}
