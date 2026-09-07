namespace SmartCampus.Api.Common.Responses
{
    public class BaseResponse<T>
    {
        public bool Success { get; init; }

        public string? Message { get; init; }

        public T? Data { get; init; }

        public object? Errors { get; init; }
    }
}
