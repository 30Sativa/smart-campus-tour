namespace SmartCampus.Application.Features.StreamRelay;

/// <summary>
/// The <c>QuestRelay</c> section of ADR-0055: the public MediaMTX relay that serves one robot's Quest camera. Nothing
/// is handed out while <see cref="Enabled"/> is false; the relay then refuses every reader.
/// </summary>
public sealed class StreamRelaySettings
{
    public const int MaximumTokenSeconds = 300;

    public StreamRelaySettings(string? whepUrl = null, string? robotCode = null, string? key = null,
        string? publishUser = null, string? publishPasswordSha256 = null, string? path = null, int tokenSeconds = 120)
    {
        if (tokenSeconds is < 30 or > MaximumTokenSeconds)
            throw new InvalidOperationException($"QuestRelay:TokenSeconds must be between 30 and {MaximumTokenSeconds}.");
        TokenLifetime = TimeSpan.FromSeconds(tokenSeconds);
        Path = string.IsNullOrWhiteSpace(path) ? "quest" : path.Trim();

        var configured = new[] { whepUrl, robotCode, key }.Count(value => !string.IsNullOrWhiteSpace(value));
        if (configured == 0)
            return;
        if (configured != 3)
            throw new InvalidOperationException("QuestRelay:WhepUrl, QuestRelay:RobotCode and QuestRelay:Key must be set together.");
        if (!Uri.TryCreate(whepUrl!.Trim(), UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps
            || !string.IsNullOrEmpty(url.Query) || !string.IsNullOrEmpty(url.UserInfo))
            throw new InvalidOperationException("QuestRelay:WhepUrl must be an https URL without query or credentials.");
        if (key!.Trim().Length < 32)
            throw new InvalidOperationException("QuestRelay:Key must be at least 32 characters.");
        var hash = publishPasswordSha256?.Trim();
        if (string.IsNullOrWhiteSpace(publishUser) || hash is null || hash.Length != 64 || !hash.All(Uri.IsHexDigit))
            throw new InvalidOperationException(
                "QuestRelay:PublishUser and QuestRelay:PublishPasswordSha256 (64 hex digits) must be set with the relay.");

        WhepUrl = url.ToString();
        RobotCode = robotCode!.Trim();
        Key = key.Trim();
        PublishUser = publishUser.Trim();
        PublishPasswordSha256 = Convert.FromHexString(hash);
    }

    public bool Enabled => WhepUrl is not null;

    /// <summary>The relay's WHEP endpoint, e.g. <c>https://stream.example:8889/quest/whep</c>.</summary>
    public string? WhepUrl { get; }

    /// <summary>The robot whose camera the relay path carries.</summary>
    public string? RobotCode { get; }

    /// <summary>The MediaMTX path, <c>quest</c> by default.</summary>
    public string Path { get; }

    /// <summary>Shared with the relay (its callback URL) and the source of the token signing key.</summary>
    public string? Key { get; }

    public string? PublishUser { get; }

    public byte[]? PublishPasswordSha256 { get; }

    public TimeSpan TokenLifetime { get; }
}
