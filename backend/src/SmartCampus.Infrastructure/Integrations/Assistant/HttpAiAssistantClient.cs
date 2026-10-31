using System.Net;
using System.Net.Http.Headers;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Assistant;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.StudentQuestions;

namespace SmartCampus.Infrastructure.Integrations.Assistant;

/// <summary>
/// Calls POST {BaseUrl}/v1/answer of ai-assistant with the shared service key.
/// Logs request IDs, status, outcome and timing: never question text, answers or provider bodies.
/// </summary>
public sealed class HttpAiAssistantClient(HttpClient client, AiAssistantConfiguration configuration,
    ILogger<HttpAiAssistantClient> logger) : IAiAssistantClient
{
    public const int MaximumResponseBytes = 32 * 1024;
    private static readonly Meter Metrics = new("SmartCampus.Assistant");
    private static readonly Histogram<double> Duration = Metrics.CreateHistogram<double>("assistant.duration", "ms");
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

        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var timeout = TimeSpan.FromSeconds(20);
        if (client.Timeout > TimeSpan.Zero && client.Timeout < timeout) timeout = client.Timeout;
        budget.CancelAfter(timeout);
        var started = Stopwatch.GetTimestamp();
        var outcome = "UNAVAILABLE";
        int? status = null;
        try
        {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, budget.Token);
            status = (int)response.StatusCode;
            if (response.StatusCode == HttpStatusCode.GatewayTimeout) throw TimedOut();
            if (!response.IsSuccessStatusCode) throw Unavailable();
            if (response.Content.Headers.ContentLength > MaximumResponseBytes) throw Unavailable();

            await using var stream = await response.Content.ReadAsStreamAsync(budget.Token);
            var bytes = new byte[MaximumResponseBytes + 1];
            var length = 0;
            int read;
            while ((read = await stream.ReadAsync(bytes.AsMemory(length), budget.Token)) > 0)
            {
                length += read;
                if (length > MaximumResponseBytes) throw Unavailable();
            }
            var reply = JsonSerializer.Deserialize<AnswerResponseBody>(bytes.AsSpan(0, length), JsonSerializerOptions.Web);
            if (reply?.OutOfScope is null || string.IsNullOrWhiteSpace(reply.Answer) ||
                reply.Answer.Length > StudentQuestionText.MaxAnswerLength) throw Unavailable();
            outcome = "SUCCESS";
            return new AssistantAnswer(reply.Answer.Trim(), reply.OutOfScope.Value);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            outcome = "TIMEOUT";
            throw TimedOut();
        }
        catch (GatewayTimeoutException)
        {
            outcome = "TIMEOUT";
            throw;
        }
        catch (Exception error) when (error is HttpRequestException or IOException or JsonException)
        {
            throw Unavailable();
        }
        catch (OperationCanceledException)
        {
            outcome = "CANCELLED";
            throw;
        }
        finally
        {
            var milliseconds = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
            Duration.Record(milliseconds, new KeyValuePair<string, object?>("outcome", outcome));
            logger.Log(outcome == "SUCCESS" ? LogLevel.Information : LogLevel.Warning,
                "AI request {RequestId} ended {Outcome}, HTTP {StatusCode}, duration {ElapsedMs} ms.",
                question.RequestId, outcome, status, milliseconds);
        }
    }

    private sealed record TurnBody(string Question, string Answer);
    private sealed record PoiBody(Guid Id, string Name, string? Description, string? NarrationText);
    private sealed record AnswerRequestBody(Guid RequestId, string Question, IReadOnlyList<TurnBody> RecentTurns,
        PoiBody? Poi, string Language);
    private sealed record AnswerResponseBody(string? Answer, bool? OutOfScope);
}
