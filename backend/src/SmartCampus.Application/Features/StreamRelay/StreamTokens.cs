using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace SmartCampus.Application.Features.StreamRelay;

public static class StreamTokenKinds
{
    /// <summary>A Student browser session (subject = BrowserSessions.Id).</summary>
    public const string Student = "S";

    /// <summary>A Staff user watching through a camera lease (subject = user id).</summary>
    public const string Staff = "T";
}

/// <summary>What a valid token says. <see cref="ExpiresAt"/> is checked by the caller, not by <see cref="StreamTokens.Read"/>.</summary>
public sealed record StreamTokenClaims(string Kind, Guid Subject, string RobotCode, DateTimeOffset ExpiresAt);

/// <summary>
/// ADR-0055 relay token: <c>v1.kind.subject.robot.expires.signature</c>, HMAC-SHA256 with a key derived from
/// <c>QuestRelay:Key</c>. Opaque to the browser; the backend checks it again on every relay connection.
/// </summary>
public static class StreamTokens
{
    private const string Version = "v1";

    public static string Issue(StreamRelaySettings settings, string kind, Guid subject, string robotCode, DateTimeOffset expiresAt)
    {
        var body = string.Join('.', Version, kind, subject.ToString("N"), Base64Url(Encoding.UTF8.GetBytes(robotCode)),
            expiresAt.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture));
        return body + "." + Base64Url(Sign(settings, body));
    }

    /// <summary>The claims of a well-formed token with a valid signature, or null.</summary>
    public static StreamTokenClaims? Read(StreamRelaySettings settings, string? token)
    {
        if (!settings.Enabled || string.IsNullOrEmpty(token) || token.Length > 512)
            return null;
        var parts = token.Split('.');
        if (parts.Length != 6 || parts[0] != Version)
            return null;
        var body = string.Join('.', parts, 0, 5);
        var signature = FromBase64Url(parts[5]);
        if (signature is null || !CryptographicOperations.FixedTimeEquals(signature, Sign(settings, body)))
            return null;
        if (parts[1] is not (StreamTokenKinds.Student or StreamTokenKinds.Staff)
            || !Guid.TryParseExact(parts[2], "N", out var subject)
            || FromBase64Url(parts[3]) is not { } robot
            || !long.TryParse(parts[4], NumberStyles.None, CultureInfo.InvariantCulture, out var expires))
            return null;
        return new(parts[1], subject, Encoding.UTF8.GetString(robot), DateTimeOffset.FromUnixTimeSeconds(expires));
    }

    /// <summary>The <c>token</c> parameter of a raw query string such as <c>token=…&amp;x=1</c>.</summary>
    public static string? FromQuery(string? query)
    {
        if (string.IsNullOrEmpty(query))
            return null;
        foreach (var pair in query.TrimStart('?').Split('&'))
        {
            var separator = pair.IndexOf('=');
            if (separator > 0 && pair[..separator] == "token")
                return Uri.UnescapeDataString(pair[(separator + 1)..]);
        }
        return null;
    }

    private static byte[] Sign(StreamRelaySettings settings, string body)
    {
        // A separate key per purpose, so the relay key itself never signs anything.
        var key = HMACSHA256.HashData(Encoding.UTF8.GetBytes(settings.Key!), "quest-relay-token-v1"u8);
        return HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(body));
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[]? FromBase64Url(string text)
    {
        if (text.Length == 0 || text.Length > 200 || !text.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_'))
            return null;
        var padded = text.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - padded.Length % 4) % 4);
        try
        {
            return Convert.FromBase64String(padded);
        }
        catch (FormatException)
        {
            return null;
        }
    }
}
