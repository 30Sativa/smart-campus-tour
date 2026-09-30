namespace SmartCampus.Application.Common.Abstractions.Authentication;

public interface IAuthTokenService
{
    string IssueAccessToken(Guid userId, string role, DateTimeOffset now);

    string CreateRefreshToken();

    byte[] HashRefreshToken(string refreshToken);
}
