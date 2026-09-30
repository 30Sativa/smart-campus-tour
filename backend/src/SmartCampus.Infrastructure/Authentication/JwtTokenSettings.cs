using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace SmartCampus.Infrastructure.Authentication;

public sealed class JwtTokenSettings(IConfiguration configuration)
{
    public string Issuer => configuration["Authentication:Jwt:Issuer"] ?? "SmartCampus.Api";

    public string Audience => configuration["Authentication:Jwt:Audience"] ?? "SmartCampus.Web";

    public SymmetricSecurityKey CreateSigningKey()
    {
        var configuredKey = configuration["Authentication:Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(configuredKey))
            throw new InvalidOperationException(
                "Configuration 'Authentication:Jwt:SigningKey' is required for authentication.");

        var keyBytes = Encoding.UTF8.GetBytes(configuredKey);
        if (keyBytes.Length < 32)
            throw new InvalidOperationException(
                "Configuration 'Authentication:Jwt:SigningKey' must contain at least 32 UTF-8 bytes.");

        return new SymmetricSecurityKey(keyBytes);
    }

    public TokenValidationParameters CreateValidationParameters() => new()
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = CreateSigningKey(),
        ValidateIssuer = true,
        ValidIssuer = Issuer,
        ValidateAudience = true,
        ValidAudience = Audience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = "sub",
        RoleClaimType = "role"
    };
}
