using Microsoft.Extensions.Configuration;

namespace SmartCampus.Infrastructure.Integrations.Assistant;

/// <summary>
/// Opt-in connection to the private ai-assistant service (docs/architecture.md §7.1).
/// Without <c>AiAssistant:BaseUrl</c> Student questions return 503 AI_UNAVAILABLE.
/// The service key is a secret: keep it in user secrets or deployment secrets, never in Git.
/// </summary>
public sealed class AiAssistantConfiguration
{
    public bool Enabled { get; }
    public Uri? BaseUrl { get; }
    public string ServiceKey { get; } = "";

    public AiAssistantConfiguration(IConfiguration configuration)
    {
        var raw = configuration["AiAssistant:BaseUrl"];
        if (string.IsNullOrWhiteSpace(raw)) return;
        if (!Uri.TryCreate(raw.Trim().TrimEnd('/') + "/", UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https") || uri.Query.Length > 0 || uri.Fragment.Length > 0 ||
            uri.UserInfo.Length > 0)
            throw new InvalidOperationException("Configuration 'AiAssistant:BaseUrl' must be an absolute http(s) URL.");
        var key = configuration["AiAssistant:ServiceKey"]?.Trim() ?? "";
        if (key.Length < 16)
            throw new InvalidOperationException(
                "Configuration 'AiAssistant:ServiceKey' must be at least 16 characters when 'AiAssistant:BaseUrl' is set.");
        BaseUrl = uri;
        ServiceKey = key;
        Enabled = true;
    }
}
