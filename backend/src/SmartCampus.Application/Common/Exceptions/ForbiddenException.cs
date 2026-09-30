namespace SmartCampus.Application.Common.Exceptions;

/// <summary>The account is known but is not allowed to access the system. Mapped to HTTP 403.</summary>
public sealed class ForbiddenException(string message) : Exception(message);
