namespace SmartCampus.Application.Common.Exceptions;

/// <summary>The caller could not be identified (bad or missing credential). Mapped to HTTP 401.</summary>
public sealed class UnauthorizedException(string message) : Exception(message);
