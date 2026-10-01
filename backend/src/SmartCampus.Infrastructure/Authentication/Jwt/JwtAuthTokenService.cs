using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using SmartCampus.Application.Common.Abstractions.Authentication;
using Microsoft.IdentityModel.Tokens;

namespace SmartCampus.Infrastructure.Authentication.Jwt;

public sealed class JwtAuthTokenService(JwtTokenSettings settings) : IAuthTokenService
{
    private static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromMinutes(15);

    public string IssueAccessToken(Guid userId, string role, DateTimeOffset now)
    {
        var token = new JwtSecurityToken(
            issuer: settings.Issuer,
            audience: settings.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, userId.ToString("D")),
                new Claim("role", role)
            ],
            notBefore: now.UtcDateTime,
            expires: now.Add(AccessTokenLifetime).UtcDateTime,
            signingCredentials: new SigningCredentials(
                settings.CreateSigningKey(),
                SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string CreateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    public byte[] HashRefreshToken(string refreshToken) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken));
}
