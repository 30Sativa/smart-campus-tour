using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Assistant;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Infrastructure.Integrations.Assistant;

/// <summary>
/// Calls POST {BaseUrl}/v1/answer of ai-assistant with the shared service key.
/// Logs only status codes and error types: never question text, answers or provider bodies.
/// </summary>
public sealed class HttpAiAssistantClient(HttpClient client, AiAssistantConfiguration configuration,
    ILogger<HttpAiAssistantClient> logger) : IAiAssistantClient
{
    private static ServiceUnavailableException Unavailable() =>
        new("Trợ lý AI đang tạm thời không dùng được. Bạn thử lại sau ít phút nhé.", "AI_UNAVAILABLE");

    private static GatewayTimeoutException TimedOut() =>
        new("Trợ lý AI trả lời quá lâu. Bạn thử hỏi lại nhé.", "AI_TIMEOUT");

    public async Task<AssistantAnswer> AnswerAsync(AssistantQuestion question, CancellationToken ct)
    {
        if (!configuration.Enabled || configuration.BaseUrl is null) throw Unavailable();
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(configuration.BaseUrl, "v1/answer"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", configuration.ServiceKey);
        var body = new AnswerRequestBody(
            question.RequestId,
            question.Question,
            question.RecentTurns.Select(t => new TurnBody(t.Question, t.Answer)).ToList(),
            question.Poi is null ? null : new PoiBody(question.Poi.Id, question.Poi.Name, question.Poi.Description,
                question.Poi.NarrationText),
            "vi");
        // Serialized up front so the request carries Content-Length instead of chunked encoding.
        request.Content = new StringContent(JsonSerializer.Serialize(body, JsonSerializerOptions.Web), Encoding.UTF8,
            "application/json");

        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, ct);
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            logger.LogWarning("AI assistant call timed out.");
            throw TimedOut();
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning("AI assistant is unreachable ({ErrorType}).", exception.GetType().Name);
            throw Unavailable();
        }

        using (response)
        {
            if (response.StatusCode == HttpStatusCode.GatewayTimeout) throw TimedOut();
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("AI assistant returned HTTP {StatusCode}.", (int)response.StatusCode);
                throw Unavailable();
            }
            AnswerResponseBody? reply;
            try
            {
                reply = await response.Content.ReadFromJsonAsync<AnswerResponseBody>(ct);
            }
            catch (JsonException)
            {
                logger.LogWarning("AI assistant returned an unreadable body.");
                throw Unavailable();
            }
            if (reply is null || string.IsNullOrWhiteSpace(reply.Answer)) throw Unavailable();
            return new AssistantAnswer(reply.Answer.Trim(), reply.OutOfScope);
        }
    }

    private sealed record TurnBody(string Question, string Answer);
    private sealed record PoiBody(Guid Id, string Name, string? Description, string? NarrationText);
    private sealed record AnswerRequestBody(Guid RequestId, string Question, IReadOnlyList<TurnBody> RecentTurns,
        PoiBody? Poi, string Language);
    private sealed record AnswerResponseBody(string? Answer, bool OutOfScope);
}
