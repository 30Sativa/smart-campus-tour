using System.Security.Cryptography;
using System.Text;

namespace SmartCampus.Infrastructure.Authentication;

/// <summary>
/// <c>Robots.CredentialHash</c> = SHA-256 of the UTF-8 device secret (32 bytes).
/// The secret is a random value of at least 32 bytes generated per robot
/// (see scripts/new-robot-secret in docs), so a fast hash is enough; it is not
/// a human password. Comparison is constant-time.
/// </summary>
public static class RobotSecretHash
{
    public static byte[] Compute(string secret) => SHA256.HashData(Encoding.UTF8.GetBytes(secret));

    public static bool Matches(string secret, byte[] expected) =>
        expected.Length == 32 && CryptographicOperations.FixedTimeEquals(Compute(secret), expected);

    public static byte[]? FromHex(string? hex)
    {
        if (string.IsNullOrWhiteSpace(hex)) return null;
        try { return Convert.FromHexString(hex.Trim()); }
        catch (FormatException) { return null; }
    }
}
