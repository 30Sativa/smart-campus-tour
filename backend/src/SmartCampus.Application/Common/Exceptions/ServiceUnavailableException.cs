namespace SmartCampus.Application.Common.Exceptions;

/// <summary>A dependency the request needs is unavailable or overloaded. Mapped to HTTP 503.</summary>
public sealed class ServiceUnavailableException(string message, string code) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>A dependency did not answer within its time budget. Mapped to HTTP 504.</summary>
public sealed class GatewayTimeoutException(string message, string code) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>The caller exceeded a per-session or per-client limit. Mapped to HTTP 429.</summary>
public sealed class TooManyRequestsException(string message, string code = "RATE_LIMITED") : Exception(message)
{
    public string Code { get; } = code;
}
