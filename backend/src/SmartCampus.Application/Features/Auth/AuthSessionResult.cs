namespace SmartCampus.Application.Features.Auth;

public sealed record AuthSessionResult(
    Guid UserId,
    string Username,
    string Role,
    string AccessToken,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt);
