namespace SmartCampus.Application.Common.Abstractions.Assistant;

/// <summary>One earlier turn of the same browser session, used only to resolve follow-up wording.</summary>
public sealed record AssistantTurn(string Question, string Answer);

/// <summary>Approved POI content snapshotted when the question was accepted.</summary>
public sealed record AssistantPoi(Guid Id, string Name, string? Description, string? NarrationText);

/// <summary>
/// What the backend sends to ai-assistant (docs/architecture.md §7.1). It never carries roster data,
/// email, access codes, session tokens or account identities.
/// </summary>
public sealed record AssistantQuestion(Guid RequestId, string Question, IReadOnlyList<AssistantTurn> RecentTurns,
    AssistantPoi? Poi);

public sealed record AssistantAnswer(string Answer, bool OutOfScope);

public interface IAiAssistantClient
{
    /// <summary>
    /// Returns the assistant's answer. Throws <c>ServiceUnavailableException</c> (AI_UNAVAILABLE) when the
    /// assistant is not configured, unreachable or overloaded, and <c>GatewayTimeoutException</c> (AI_TIMEOUT)
    /// when it does not answer within the configured budget.
    /// </summary>
    Task<AssistantAnswer> AnswerAsync(AssistantQuestion question, CancellationToken ct);
}
