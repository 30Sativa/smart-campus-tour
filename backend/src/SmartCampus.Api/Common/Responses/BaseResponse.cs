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

        /// <summary>A refusal's own explanation when it names no field, e.g. a rule checked in a handler.</summary>
        [JsonPropertyOrder(5)]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Detail { get; init; }
    }
}
