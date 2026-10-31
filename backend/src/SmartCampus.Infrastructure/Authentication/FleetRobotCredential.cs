using System.Security.Cryptography;
using System.Text;

namespace SmartCampus.Infrastructure.Authentication;

public sealed record FleetRobotCredential(string Secret, byte[] Hash);

public static class FleetRobotCredentialHash
{
    private const int EntropyBytes = 32;

    public static FleetRobotCredential Create()
    {
        var bytes = RandomNumberGenerator.GetBytes(EntropyBytes);
        var secret = Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return new FleetRobotCredential(secret, Hash(secret));
    }

    public static byte[] Hash(string secret) =>
        SHA256.HashData(Encoding.ASCII.GetBytes(secret));

    public static bool Verify(string secret, byte[]? storedHash)
    {
        if (!IsValidFormat(secret) || storedHash is not { Length: 32 })
            return false;

        return CryptographicOperations.FixedTimeEquals(Hash(secret), storedHash);
    }

    public static bool IsValidFormat(string? secret)
    {
        if (secret is null || secret.Length != 43)
            return false;

        try
        {
            var decoded = Convert.FromBase64String(secret.Replace('-', '+').Replace('_', '/') + "=");
            var canonical = Convert.ToBase64String(decoded).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            return decoded.Length == EntropyBytes && string.Equals(secret, canonical, StringComparison.Ordinal);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
