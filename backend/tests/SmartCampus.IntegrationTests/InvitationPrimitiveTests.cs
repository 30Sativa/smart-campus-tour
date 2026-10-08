using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Infrastructure.Integrations.Invitations;

namespace SmartCampus.IntegrationTests;

public sealed class InvitationPrimitiveTests
{
    internal static Dictionary<string, string> ConfigurationValues() => new() {
        ["Invitations:Enabled"] = "true", ["Invitations:EmailWorkerEnabled"] = "false",
        ["Invitations:HashKey"] = Convert.ToBase64String(Enumerable.Repeat((byte)1, 32).ToArray()),
        ["Invitations:ProtectionKey"] = Convert.ToBase64String(Enumerable.Repeat((byte)2, 32).ToArray()),
        ["Invitations:PublicBaseUrl"] = "https://tour.example.test", ["Invitations:SupportEmail"] = "support@example.test",
        ["Resend:ApiKey"] = "test-key-never-used-with-real-provider", ["Resend:From"] = "CampusTour <tour@example.test>"
    };
    internal static InvitationConfiguration Configuration() => new(new ConfigurationBuilder()
        .AddInMemoryCollection(ConfigurationValues().Select(p => new KeyValuePair<string, string?>(p.Key, p.Value))).Build());

    [Fact]
    public void Codes_AreRandom_Normalized_AndCiphertextIsBoundToInvitationAndVersion()
    {
        var codec = new InvitationCodeService(Configuration());
        var id = Guid.NewGuid();
        var first = codec.Create(id, 1);
        var second = codec.Create(id, 1);
        var revealed = codec.Reveal(id, 1, first.Protected);
        Assert.Equal(23, revealed.Length);
        Assert.Equal(first.Hash, codec.Hash(revealed.ToLowerInvariant().Replace("-", " ")));
        Assert.NotEqual(first.Hash, second.Hash);
        Assert.DoesNotContain(revealed.Replace("-", ""), Encoding.UTF8.GetString(first.Protected));
        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => codec.Reveal(Guid.NewGuid(), 1, first.Protected));
        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => codec.Reveal(id, 2, first.Protected));
        first.Protected[^1] ^= 1;
        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => codec.Reveal(id, 1, first.Protected));
    }

    [Theory]
    [InlineData("Invitations:HashKey", "short")]
    [InlineData("Resend:From", "not-an-address")]
    [InlineData("Invitations:PublicBaseUrl", "http://tour.example.test")]
    [InlineData("Invitations:PublicBaseUrl", "https://tour.example.test?code=secret")]
    [InlineData("Invitations:ExpiryHoursAfterStart", "0")]
    public void EnabledConfiguration_FailsFast_WithoutEchoingValues(string key, string value)
    {
        var settings = ConfigurationValues(); settings[key] = value;
        var error = Assert.Throws<InvalidOperationException>(() => new InvitationConfiguration(new ConfigurationBuilder()
            .AddInMemoryCollection(settings.Select(p => new KeyValuePair<string, string?>(p.Key, p.Value))).Build()));
        Assert.Contains(key, error.Message);
        Assert.DoesNotContain(value, error.Message);
    }

    [Theory]
    [InlineData(200, "{\"id\":\"provider-email-id\"}", "ACCEPTED")]
    [InlineData(200, "{}", "UNKNOWN")]
    [InlineData(200, "not-json", "UNKNOWN")]
    [InlineData(403, "{\"message\":\"recipient-private@example.test\"}", "FAILED")]
    [InlineData(429, "quota exceeded", "FAILED")]
    [InlineData(500, "server error", "UNKNOWN")]
    public async Task Resend_UsesOnePrivateRecipient_CodeFreeUrl_AndStableAttemptKey(int status, string body, string expected)
    {
        var config = Configuration(); var codec = new InvitationCodeService(config);
        var id = Guid.NewGuid(); var tour = Guid.NewGuid(); var attempt = Guid.NewGuid();
        var code = codec.Create(id, 1); var plaintext = codec.Reveal(id, 1, code.Protected);
        var handler = new CaptureHandler(status, body);
        using var http = new HttpClient(handler);
        var sender = new ResendInvitationEmailSender(http, config, codec);
        var result = await sender.SendAsync(new(tour, id, attempt, "viewer@example.test", "<script>Tour</script>",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), 1, code.Protected), default);
        Assert.Equal(expected, result.Status);
        Assert.Equal("https://api.resend.com/emails", handler.Url);
        Assert.Equal("Bearer", handler.AuthorizationScheme);
        Assert.Equal("campus-tour/" + attempt.ToString("D"), handler.IdempotencyKey);
        using var json = JsonDocument.Parse(handler.Body!);
        Assert.Equal("viewer@example.test", Assert.Single(json.RootElement.GetProperty("to").EnumerateArray()).GetString());
        var html = json.RootElement.GetProperty("html").GetString()!;
        Assert.Contains("https://tour.example.test/tour/" + tour, html);
        Assert.DoesNotContain("?code=", html); Assert.DoesNotContain("<script>", html);
        Assert.Contains(plaintext, html);
        Assert.DoesNotContain("recipient-private", JsonSerializer.Serialize(result));
    }
    [Fact]
    public async Task NetworkFailure_RemainsUnknown()
    {
        using var http = new HttpClient(new ThrowingHandler());
        var codec = new InvitationCodeService(Configuration()); var id = Guid.NewGuid();
        var result = await new ResendInvitationEmailSender(http, Configuration(), codec).SendAsync(new(Guid.NewGuid(), id, Guid.NewGuid(),
            "viewer@example.test", "Tour", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), 1, codec.Create(id, 1).Protected), default);
        Assert.Equal("UNKNOWN", result.Status);
    }
    private sealed class CaptureHandler(int status, string body) : HttpMessageHandler
    {
        public string? Url, AuthorizationScheme, IdempotencyKey, Body;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Url = request.RequestUri!.ToString(); AuthorizationScheme = request.Headers.Authorization!.Scheme;
            IdempotencyKey = request.Headers.GetValues("Idempotency-Key").Single();
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new((HttpStatusCode)status) { Content = new StringContent(body) };
        }
    }
    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            throw new HttpRequestException("private-provider-data");
    }
}
