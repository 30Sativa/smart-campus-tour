using SmartCampus.Application.Common.Abstractions.Authentication;

namespace SmartCampus.Infrastructure.Authentication.UsernameNormalization;

public sealed class InvariantUsernameNormalizer : IUsernameNormalizer
{
    public string Normalize(string username)
    {
        ArgumentNullException.ThrowIfNull(username);
        return username.Trim().ToUpperInvariant();
    }
}
