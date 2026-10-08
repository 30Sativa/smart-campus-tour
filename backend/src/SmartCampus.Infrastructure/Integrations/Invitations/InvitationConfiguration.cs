using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using SmartCampus.Application.Common.Abstractions.Invitations;

namespace SmartCampus.Infrastructure.Integrations.Invitations;

public sealed class InvitationConfiguration
{
    public InvitationSettings Settings { get; }
    public byte[] HashKey { get; } = [];
    public byte[] ProtectionKey { get; } = [];
    public string ApiKey { get; } = "";
    public string From { get; } = "";
    public string PublicBaseUrl { get; } = "";
    public string SupportEmail { get; } = "";

    public InvitationConfiguration(IConfiguration configuration)
    {
        var enabled = string.Equals(configuration["Invitations:Enabled"], "true", StringComparison.OrdinalIgnoreCase);
        var hours = enabled ? ParseInt(configuration, "Invitations:ExpiryHoursAfterStart", 24) : 24;
        var idleMinutes = enabled ? ParseInt(configuration, "Invitations:SessionIdleMinutes", 10) : 10;
        Settings = new(enabled, hours, idleMinutes);
        if (!enabled) return;
        if (hours is < 1 or > 168) throw Invalid("Invitations:ExpiryHoursAfterStart");
        if (idleMinutes is < 1 or > 60) throw Invalid("Invitations:SessionIdleMinutes");
        HashKey = Key(configuration, "Invitations:HashKey");
        ProtectionKey = Key(configuration, "Invitations:ProtectionKey");
        if (HashKey.AsSpan().SequenceEqual(ProtectionKey)) throw Invalid("Invitations:ProtectionKey");
        ApiKey = Required(configuration, "Resend:ApiKey");
        From = Required(configuration, "Resend:From");
        if (!MailAddress.TryCreate(From, out _)) throw Invalid("Resend:From");
        PublicBaseUrl = Required(configuration, "Invitations:PublicBaseUrl").TrimEnd('/');
        if (!Uri.TryCreate(PublicBaseUrl, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
            uri.Query.Length > 0 || uri.Fragment.Length > 0 || uri.UserInfo.Length > 0 || uri.AbsolutePath != "/")
            throw Invalid("Invitations:PublicBaseUrl");
        SupportEmail = Required(configuration, "Invitations:SupportEmail");
        if (!MailAddress.TryCreate(SupportEmail, out _)) throw Invalid("Invitations:SupportEmail");
    }
    private static string Required(IConfiguration c, string key) =>
        string.IsNullOrWhiteSpace(c[key]) ? throw Invalid(key) : c[key]!.Trim();
    private static int ParseInt(IConfiguration c, string key, int fallback) =>
        c[key] is null ? fallback : int.TryParse(c[key], out var value) ? value : throw Invalid(key);
    private static byte[] Key(IConfiguration c, string key)
    {
        try { var bytes = Convert.FromBase64String(Required(c, key)); return bytes.Length == 32 ? bytes : throw Invalid(key); }
        catch (FormatException) { throw Invalid(key); }
    }
    private static InvalidOperationException Invalid(string key) => new($"Invitation setting '{key}' is missing or invalid.");
}
