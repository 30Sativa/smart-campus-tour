using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.StudentQuestions;

/// <summary>
/// In-memory per-session limits and idempotency for Student Q&amp;A (docs/architecture.md §7.1):
/// at most <see cref="QuestionsPerMinute"/> questions per minute and one in flight per browser session,
/// and a repeat of the same questionId + text returns the first answer without a second assistant call.
/// Nothing is persisted. One backend instance is assumed for V1.
/// </summary>
public sealed class StudentQuestionGate(TimeProvider clock)
{
    public const int QuestionsPerMinute = 6;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan AnswerLifetime = TimeSpan.FromMinutes(10);
    private const int MaxRememberedAnswers = 10_000;

    private readonly object sync = new();
    private readonly Dictionary<Guid, SessionState> sessions = new();
    private readonly Dictionary<(Guid SessionId, Guid QuestionId), Remembered> answers = new();

    /// <summary>The earlier answer for this question, or null. Throws when the id is reused for other text.</summary>
    public StudentAnswer? Find(Guid sessionId, Guid questionId, string text)
    {
        lock (sync)
        {
            Prune(clock.GetUtcNow());
            if (!answers.TryGetValue((sessionId, questionId), out var remembered)) return null;
            if (!string.Equals(remembered.Text, text, StringComparison.Ordinal))
                throw new ConflictException("Mã câu hỏi đã được dùng cho một câu khác.", "QUESTION_ID_REUSED");
            return remembered.Answer;
        }
    }

    /// <summary>Starts a question for the session, or returns false when it is over its limits.</summary>
    public bool TryEnter(Guid sessionId)
    {
        lock (sync)
        {
            var now = clock.GetUtcNow();
            if (!sessions.TryGetValue(sessionId, out var state))
            {
                state = new SessionState();
                sessions[sessionId] = state;
            }
            while (state.Starts.Count > 0 && now - state.Starts.Peek() >= Window) state.Starts.Dequeue();
            if (state.InFlight || state.Starts.Count >= QuestionsPerMinute) return false;
            state.Starts.Enqueue(now);
            state.InFlight = true;
            return true;
        }
    }

    public void Exit(Guid sessionId)
    {
        lock (sync)
        {
            if (sessions.TryGetValue(sessionId, out var state)) state.InFlight = false;
        }
    }

    public void Remember(Guid sessionId, Guid questionId, string text, StudentAnswer answer)
    {
        lock (sync)
        {
            var now = clock.GetUtcNow();
            answers[(sessionId, questionId)] = new Remembered(text, answer, now);
            if (answers.Count > MaxRememberedAnswers)
            {
                foreach (var oldest in answers.OrderBy(entry => entry.Value.At).Take(answers.Count - MaxRememberedAnswers)
                             .Select(entry => entry.Key).ToList())
                    answers.Remove(oldest);
            }
        }
    }

    private void Prune(DateTimeOffset now)
    {
        foreach (var key in answers.Where(entry => now - entry.Value.At > AnswerLifetime).Select(entry => entry.Key).ToList())
            answers.Remove(key);
        foreach (var key in sessions.Where(entry => !entry.Value.InFlight &&
                     (entry.Value.Starts.Count == 0 || now - entry.Value.Starts.Last() >= Window))
                     .Select(entry => entry.Key).ToList())
            sessions.Remove(key);
    }

    private sealed class SessionState
    {
        public bool InFlight { get; set; }
        public Queue<DateTimeOffset> Starts { get; } = new();
    }

    private sealed record Remembered(string Text, StudentAnswer Answer, DateTimeOffset At);
}
