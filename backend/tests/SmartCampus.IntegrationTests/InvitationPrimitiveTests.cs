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
        ["Resend:ApiKey"] = "test-key-never-used-with-real-provider", ["Resend:From"] = "CampusTour <noreply@example.test>"
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
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), 1, code.Protected, "Nguyễn Văn A", "Lớp 12A1", "THPT Thử", false), default);
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
    public async Task CancelEmail_CarriesTourTimeReasonAndContact_ButNoLinkOrCode()
    {
        var config = Configuration(); var codec = new InvitationCodeService(config);
        var handler = new CaptureHandler(200, "{\"id\":\"preview\"}");
        using var http = new HttpClient(handler);
        var attempt = Guid.NewGuid(); var registration = Guid.NewGuid(); var tour = Guid.NewGuid();
        var result = await new ResendInvitationEmailSender(http, config, codec).SendTourCancelledAsync(new(tour, attempt, registration,
            "rep@example.test", "<b>Tour</b>", new DateTimeOffset(2026, 11, 20, 2, 0, 0, TimeSpan.Zero), "Robot <maintenance>"), default);
        Assert.Equal("ACCEPTED", result.Status);
        Assert.Equal($"campus-tour/tour-cancel/{attempt:D}/{registration:D}", handler.IdempotencyKey);
        using var json = JsonDocument.Parse(handler.Body!);
        Assert.Equal("rep@example.test", Assert.Single(json.RootElement.GetProperty("to").EnumerateArray()).GetString());
        var html = json.RootElement.GetProperty("html").GetString()!;
        var text = json.RootElement.GetProperty("text").GetString()!;
        Assert.Contains("20/11/2026 09:00", html); Assert.Contains("20/11/2026 09:00 (UTC+7)", text);
        Assert.Contains("&lt;b&gt;Tour&lt;/b&gt;", html); Assert.DoesNotContain("<b>Tour", html);
        Assert.Contains("Robot &lt;maintenance&gt;", html); Assert.Contains("Lý do: Robot <maintenance>", text);
        Assert.Contains("support@example.test", html); Assert.Contains("support@example.test", text);
        foreach (var body in new[] { html, text })
        {
            Assert.DoesNotContain("https://", body);
            Assert.DoesNotContain("/tour/", body);
            Assert.DoesNotContain(tour.ToString(), body);
            Assert.DoesNotContain("Mã truy cập", body);
        }
    }

    private const string RiskyTour = "Khoa <CNTT> & \"AI\"";
    private const string Footer = "Gửi từ CampusTour, Trường Đại học FPT TP.HCM";

    [Fact]
    public async Task InvitationEmail_GreetsByRowAndProfile_UsesWebButtonLabel_AndPlainTextMatchesHtml()
    {
        var (subject, html, text) = await SendInvitation("Nguyễn <Văn> A", "12A1 & 12A2", "THPT <Lê Lợi>", sharedViewing: false,
            start: new DateTimeOffset(2026, 10, 9, 18, 30, 0, TimeSpan.Zero));
        Assert.Equal($"Lời mời tham quan: {RiskyTour}, 10/10 01:30", subject);
        Assert.Contains("Khoa &lt;CNTT&gt; &amp; &quot;AI&quot;", html);
        foreach (var raw in new[] { "<CNTT>", "<Văn>", "<Lê Lợi>" }) Assert.DoesNotContain(raw, html);
        string[] shared =
        [
            "Xin chào Nguyễn <Văn> A",
            "Trường Đại học FPT TP.HCM mời bạn tham quan campus từ xa cùng đoàn 12A1 & 12A2 (THPT <Lê Lợi>).",
            RiskyTour, "Vào Tour", "Chuẩn bị", "Mở link trước giờ bắt đầu 10 phút.", "Dùng Chrome hoặc Edge bản mới.",
            "Nên có tai nghe.", "10/10/2026 01:30", "Không chia sẻ mã", Footer
        ];
        AssertBothBodies(html, text, shared);
        foreach (var body in new[] { Visible(html), text })
        {
            Assert.DoesNotContain("bấm Tham gia", body);
            Assert.DoesNotContain("Đây là điểm xem chung", body);
        }
        Assert.Contains("rồi bấm Vào Tour.", text);
        AssertNoLongDash(subject, html, text);
    }

    [Fact]
    public async Task SharedViewingInvitation_TellsTheRoomToUseTheProjectorMachine_InHtmlAndPlainText()
    {
        var (_, html, text) = await SendInvitation("Phòng chiếu A", "Lớp 11", "THPT Thử", sharedViewing: true,
            start: new DateTimeOffset(2026, 10, 9, 2, 0, 0, TimeSpan.Zero));
        AssertBothBodies(html, text, ["Xin chào Phòng chiếu A", "Đây là điểm xem chung, hãy mở trên máy nối màn chiếu.", Footer]);
    }

    [Fact]
    public async Task CancelEmail_SubjectUsesVietnamDate_FooterAndPlainTextMatchHtml()
    {
        var handler = new CaptureHandler(200, "{\"id\":\"preview\"}");
        using var http = new HttpClient(handler);
        var config = Configuration();
        // 18:00 UTC on 20/11 is already 21/11 in Asia/Ho_Chi_Minh.
        await new ResendInvitationEmailSender(http, config, new InvitationCodeService(config)).SendTourCancelledAsync(new(Guid.NewGuid(),
            Guid.NewGuid(), Guid.NewGuid(), "rep@example.test", RiskyTour, new DateTimeOffset(2026, 11, 20, 18, 0, 0, TimeSpan.Zero),
            "Buổi tham quan không bắt đầu đúng giờ nên đã bị huỷ. Đại học FPT sẽ liên hệ nếu sắp xếp lại."), default);
        var (subject, html, text) = Payload(handler);
        Assert.Equal($"Buổi tham quan đã bị huỷ: {RiskyTour}, 21/11", subject);
        Assert.Contains("Khoa &lt;CNTT&gt; &amp; &quot;AI&quot;", html); Assert.DoesNotContain("<CNTT>", html);
        AssertBothBodies(html, text, ["Buổi tham quan đã bị huỷ", RiskyTour, "21/11/2026 01:00",
            "Lý do: Buổi tham quan không bắt đầu đúng giờ nên đã bị huỷ. Đại học FPT sẽ liên hệ nếu sắp xếp lại.",
            "Các lời mời của buổi này không còn dùng được.", Footer]);
        AssertNoLongDash(subject, html, text);
    }

    [Fact]
    public async Task RosterExpiredEmail_SubjectNamesTheTour_FooterAndPlainTextMatchHtml()
    {
        var handler = new CaptureHandler(200, "{\"id\":\"preview\"}");
        using var http = new HttpClient(handler);
        var config = Configuration();
        await new ResendInvitationEmailSender(http, config, new InvitationCodeService(config)).SendRosterExpiredAsync(new(Guid.NewGuid(),
            Guid.NewGuid(), Guid.NewGuid(), "rep@example.test", RiskyTour, new DateTimeOffset(2026, 11, 20, 2, 0, 0, TimeSpan.Zero), 2, 1), default);
        var (subject, html, text) = Payload(handler);
        Assert.Equal($"Một số dòng đăng ký đã hết hạn: {RiskyTour}", subject);
        Assert.Contains("Khoa &lt;CNTT&gt; &amp; &quot;AI&quot;", html); Assert.DoesNotContain("<CNTT>", html);
        AssertBothBodies(html, text, ["Một số dòng đăng ký đã hết hạn", RiskyTour, "20/11/2026 09:00", "2 dòng đăng ký chờ duyệt",
            "1 yêu cầu đổi email", "Vui lòng xem chi tiết trong trang Đại diện trường.", Footer]);
        AssertNoLongDash(subject, html, text);
    }

    private static async Task<(string Subject, string Html, string Text)> SendInvitation(string recipientName, string group, string school,
        bool sharedViewing, DateTimeOffset start)
    {
        var config = Configuration(); var codec = new InvitationCodeService(config);
        var id = Guid.NewGuid(); var code = codec.Create(id, 1);
        var handler = new CaptureHandler(200, "{\"id\":\"preview\"}");
        using var http = new HttpClient(handler);
        await new ResendInvitationEmailSender(http, config, codec).SendAsync(new(Guid.NewGuid(), id, Guid.NewGuid(), "viewer@example.test",
            RiskyTour, start, start.AddDays(1), 1, code.Protected, recipientName, group, school, sharedViewing), default);
        return Payload(handler);
    }

    private static (string Subject, string Html, string Text) Payload(CaptureHandler handler)
    {
        using var json = JsonDocument.Parse(handler.Body!);
        var root = json.RootElement;
        return (root.GetProperty("subject").GetString()!, root.GetProperty("html").GetString()!, root.GetProperty("text").GetString()!);
    }

    /// <summary>The words a reader sees in the HTML: no head, preheader or tags, entities decoded, whitespace collapsed.</summary>
    private static string Visible(string html)
    {
        var body = System.Text.RegularExpressions.Regex.Replace(html, "<head>.*?</head>", " ", System.Text.RegularExpressions.RegexOptions.Singleline);
        body = System.Text.RegularExpressions.Regex.Replace(body, "<div style=\"display:none[^>]*>.*?</div>", " ", System.Text.RegularExpressions.RegexOptions.Singleline);
        body = WebUtility.HtmlDecode(System.Text.RegularExpressions.Regex.Replace(body, "<[^>]+>", " "));
        return System.Text.RegularExpressions.Regex.Replace(body, "\\s+", " ");
    }

    private static void AssertBothBodies(string html, string text, IEnumerable<string> phrases)
    {
        var visible = Visible(html);
        foreach (var phrase in phrases)
        {
            Assert.Contains(phrase, visible);
            Assert.Contains(phrase, text);
        }
    }

    private static void AssertNoLongDash(params string[] values) =>
        Assert.All(values, value => { Assert.DoesNotContain("—", value); Assert.DoesNotContain("–", value); });

    [Fact]
    public async Task InvitationEmail_PreservesAccessInstructions_InHtmlAndPlainText_WithVietnamTimes()
    {
        var config = Configuration(); var codec = new InvitationCodeService(config);
        var id = Guid.NewGuid(); var tour = Guid.NewGuid(); var code = codec.Create(id, 1);
        var plaintext = codec.Reveal(id, 1, code.Protected);
        var handler = new CaptureHandler(200, "{\"id\":\"preview\"}");
        using var http = new HttpClient(handler);
        await new ResendInvitationEmailSender(http, config, codec).SendAsync(new(tour, id, Guid.NewGuid(),
            "viewer@example.test", "Campus <img src=x onerror=alert(1)> & science",
            new DateTimeOffset(2026, 10, 9, 18, 30, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 10, 10, 18, 30, 0, TimeSpan.Zero), 1, code.Protected, "Nguyễn Văn A", "Lớp 12A1", "THPT Thử", false), default);

        using var json = JsonDocument.Parse(handler.Body!);
        var payload = json.RootElement;
        var html = payload.GetProperty("html").GetString()!;
        var text = payload.GetProperty("text").GetString()!;
        Assert.Equal(config.From, payload.GetProperty("from").GetString());
        Assert.Contains("Campus &lt;img src=x onerror=alert(1)&gt; &amp; science", html);
        Assert.DoesNotContain("<img", html);
        Assert.Contains("Campus <img src=x onerror=alert(1)> & science", text);
        foreach (var body in new[] { html, text })
        {
            Assert.Contains("10/10/2026 01:30", body);
            Assert.Contains("11/10/2026 01:30", body);
            Assert.Contains("UTC+7", body);
            Assert.Contains("Mã truy cập", body);
            Assert.Contains(plaintext, body);
            Assert.Contains("Không chia sẻ mã", body);
            Assert.Contains("gửi lại email giữ nguyên mã", body);
            Assert.Contains("support@example.test", body);
            Assert.DoesNotContain("viewer@example.test", body);
        }
        var links = System.Text.RegularExpressions.Regex.Matches(html, "href=\"([^\"]+)\"")
            .Select(match => WebUtility.HtmlDecode(match.Groups[1].Value)).ToArray();
        Assert.Equal(new[] { "https://tour.example.test/tour/" + tour,
            "https://tour.example.test/tour/" + tour, "mailto:support@example.test" }, links);
        Assert.All(links, link => Assert.DoesNotContain(plaintext, link));
        Assert.DoesNotContain(plaintext, payload.GetProperty("subject").GetString()!);
        Assert.Contains("Trang Tour", text, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task NetworkFailure_RemainsUnknown()
    {
        using var http = new HttpClient(new ThrowingHandler());
        var codec = new InvitationCodeService(Configuration()); var id = Guid.NewGuid();
        var result = await new ResendInvitationEmailSender(http, Configuration(), codec).SendAsync(new(Guid.NewGuid(), id, Guid.NewGuid(),
            "viewer@example.test", "Tour", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), 1, codec.Create(id, 1).Protected, "Nguyễn Văn A", "Lớp 12A1", "THPT Thử", false), default);
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
