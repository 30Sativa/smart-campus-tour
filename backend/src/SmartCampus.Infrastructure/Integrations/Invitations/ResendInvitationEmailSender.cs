using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SmartCampus.Application.Common.Abstractions.Invitations;

namespace SmartCampus.Infrastructure.Integrations.Invitations;

public sealed class ResendInvitationEmailSender(HttpClient client, InvitationConfiguration configuration, IInvitationCodeService codes)
    : IInvitationEmailSender
{
    public async Task<EmailSendResult> SendAsync(InvitationEmail email, CancellationToken ct)
    {
        var code = codes.Reveal(email.InvitationId, email.AccessVersion, email.ProtectedCode);
        var link = configuration.PublicBaseUrl + "/tour/" + email.TourId;
        var (html, text) = InvitationEmailTemplate.Render(email, code, link, configuration.SupportEmail);
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", configuration.ApiKey);
        request.Headers.Add("Idempotency-Key", "campus-tour/" + email.AttemptId.ToString("D"));
        request.Content = JsonContent.Create(new { from = configuration.From, to = new[] { email.Recipient },
            subject = "Lời mời tham gia CampusTour", html, text });
        try
        {
            using var response = await client.SendAsync(request, ct);
            if (response.IsSuccessStatusCode)
            {
                try {
                    using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
                    return json.RootElement.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(id.GetString())
                        ? new("ACCEPTED", "RESEND_ACCEPTED") : new("UNKNOWN", "INVALID_RESPONSE");
                } catch (JsonException) { return new("UNKNOWN", "INVALID_RESPONSE"); }
            }
            // Never persist/log provider response bodies: they can echo recipient data.
            return (int)response.StatusCode >= 500 || response.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.Conflict
                ? new("UNKNOWN", "PROVIDER_UNCERTAIN") : new("FAILED", "PROVIDER_REJECTED");
        }
        catch (HttpRequestException) { return new("UNKNOWN", "NETWORK_UNCERTAIN"); }
        catch (OperationCanceledException) { return new("UNKNOWN", "TIMEOUT_OR_CANCELLED"); }
    }
}
