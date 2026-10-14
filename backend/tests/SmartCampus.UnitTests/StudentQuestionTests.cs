using System.Security.Cryptography;
using System.Text;
using SmartCampus.Application.Common.Abstractions.Assistant;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.StudentQuestions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class StudentQuestionTests
{
    private static readonly Guid TourId = Guid.NewGuid();
    private static readonly Guid SessionId = Guid.NewGuid();
    private static readonly StudentQuestionAccess Running = new(SessionId, "RUNNING", "INDIVIDUAL");

    private static AskStudentQuestionCommand Ask(string text = "Robot dùng cảm biến gì?", Guid? id = null,
        string? token = "session-token", IReadOnlyList<StudentQuestionTurn>? turns = null) =>
        new(TourId, token, id ?? Guid.NewGuid(), text, turns ?? []);

    private sealed class Harness
    {
        public FakeRepository Repository { get; } = new();
        public FakeAssistant Assistant { get; } = new();
        public FakeClock Clock { get; } = new();
        public StudentQuestionGate Gate { get; }
        public AskStudentQuestionCommandHandler Handler { get; }

        public Harness(bool enabled = true)
        {
            Gate = new StudentQuestionGate(Clock);
            Handler = new AskStudentQuestionCommandHandler(Repository, new FakeCodes(), new InvitationSettings(enabled, 24),
                Assistant, Gate, Clock);
        }
    }

    [Fact]
    public async Task ValidSession_ReturnsAnswer_WithoutSessionDataInTheAssistantRequest()
    {
        var h = new Harness();
        var answer = await h.Handler.Handle(Ask("  Robot dùng cảm biến gì?  ",
            turns: [new StudentQuestionTurn("Robot là gì?", "Là AMR.")]), CancellationToken.None);

        Assert.Equal("Robot dùng LiDAR.", answer.Answer);
        Assert.False(answer.OutOfScope);
        Assert.Null(answer.Poi);
        var sent = Assert.Single(h.Assistant.Calls);
        Assert.Equal("Robot dùng cảm biến gì?", sent.Question);
        Assert.Single(sent.RecentTurns);
        Assert.Null(sent.Poi);
        Assert.Equal(2, h.Repository.Checks); // before and after the assistant call
    }

    [Fact]
    public async Task RepeatedQuestionId_ReturnsFirstAnswer_WithoutSecondAssistantCall()
    {
        var h = new Harness();
        var id = Guid.NewGuid();
        var first = await h.Handler.Handle(Ask(id: id), CancellationToken.None);
        var second = await h.Handler.Handle(Ask(id: id), CancellationToken.None);

        Assert.Same(first, second);
        Assert.Single(h.Assistant.Calls);
        var reused = await Assert.ThrowsAsync<ConflictException>(() => h.Handler.Handle(Ask("Câu khác?", id), CancellationToken.None));
        Assert.Equal("QUESTION_ID_REUSED", reused.Code);
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("session-token", false)]
    public async Task MissingCookieOrDisabledInvitations_AreUnauthorized(string? token, bool enabled)
    {
        var h = new Harness(enabled);
        await Assert.ThrowsAsync<UnauthorizedException>(() => h.Handler.Handle(Ask(token: token), CancellationToken.None));
        Assert.Empty(h.Assistant.Calls);
    }

    [Fact]
    public async Task UnknownOrClosedSession_IsUnauthorized()
    {
        var h = new Harness();
        h.Repository.Results.Enqueue(null);
        await Assert.ThrowsAsync<UnauthorizedException>(() => h.Handler.Handle(Ask(), CancellationToken.None));
        Assert.Empty(h.Assistant.Calls);
    }

    [Theory]
    [InlineData("SCHEDULED")]
    [InlineData("READY")]
    [InlineData("COMPLETED")]
    [InlineData("CANCELLED")]
    public async Task TourNotRunning_IsConflict(string state)
    {
        var h = new Harness();
        h.Repository.Results.Enqueue(Running with { TourState = state });
        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Handler.Handle(Ask(), CancellationToken.None));
        Assert.Equal("TOUR_NOT_RUNNING", error.Code);
        Assert.Empty(h.Assistant.Calls);
    }

    [Fact]
    public async Task AccessRevokedWhileAssistantWorks_DropsTheLateAnswer()
    {
        var h = new Harness();
        var id = Guid.NewGuid();
        h.Repository.Results.Enqueue(Running);
        h.Repository.Results.Enqueue(null); // revoked before the answer returns
        await Assert.ThrowsAsync<UnauthorizedException>(() => h.Handler.Handle(Ask(id: id), CancellationToken.None));

        // Nothing was remembered: after access is restored the same question is asked again.
        await h.Handler.Handle(Ask(id: id), CancellationToken.None);
        Assert.Equal(2, h.Assistant.Calls.Count);
    }

    [Fact]
    public async Task TourEndedWhileAssistantWorks_DropsTheLateAnswer()
    {
        var h = new Harness();
        h.Repository.Results.Enqueue(Running);
        h.Repository.Results.Enqueue(Running with { TourState = "COMPLETED" });
        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Handler.Handle(Ask(), CancellationToken.None));
        Assert.Equal("TOUR_NOT_RUNNING", error.Code);
    }

    [Fact]
    public async Task SixQuestionsPerMinute_ThenRateLimited_UntilTheWindowPasses()
    {
        var h = new Harness();
        for (var i = 0; i < StudentQuestionGate.QuestionsPerMinute; i++)
            await h.Handler.Handle(Ask($"Câu {i}?"), CancellationToken.None);

        var limited = await Assert.ThrowsAsync<TooManyRequestsException>(() => h.Handler.Handle(Ask("Câu 7?"), CancellationToken.None));
        Assert.Equal("RATE_LIMITED", limited.Code);

        h.Clock.Advance(TimeSpan.FromMinutes(1));
        await h.Handler.Handle(Ask("Câu 7?"), CancellationToken.None);
    }

    [Fact]
    public async Task AssistantFailure_Propagates_AndReleasesTheSession()
    {
        var h = new Harness();
        h.Assistant.Failure = new ServiceUnavailableException("down", "AI_UNAVAILABLE");
        var error = await Assert.ThrowsAsync<ServiceUnavailableException>(() => h.Handler.Handle(Ask(), CancellationToken.None));
        Assert.Equal("AI_UNAVAILABLE", error.Code);

        h.Assistant.Failure = null;
        await h.Handler.Handle(Ask(), CancellationToken.None); // not stuck "in flight"
    }

    [Fact]
    public void Gate_AllowsOneQuestionInFlightPerSession()
    {
        var gate = new StudentQuestionGate(new FakeClock());
        Assert.True(gate.TryEnter(SessionId));
        Assert.False(gate.TryEnter(SessionId));
        Assert.True(gate.TryEnter(Guid.NewGuid()));
        gate.Exit(SessionId);
        Assert.True(gate.TryEnter(SessionId));
    }

    [Fact]
    public void Gate_ForgetsAnswersAfterTenMinutes()
    {
        var clock = new FakeClock();
        var gate = new StudentQuestionGate(clock);
        var id = Guid.NewGuid();
        gate.Remember(SessionId, id, "q", new StudentAnswer(id, "a", false, null, clock.GetUtcNow()));
        Assert.NotNull(gate.Find(SessionId, id, "q"));
        clock.Advance(TimeSpan.FromMinutes(11));
        Assert.Null(gate.Find(SessionId, id, "q"));
    }

    [Theory]
    [InlineData("", 0, false)]
    [InlineData("   ", 0, false)]
    [InlineData("Robot dùng gì?", 0, true)]
    [InlineData("Robot dùng gì?", 3, true)]
    [InlineData("Robot dùng gì?", 4, false)]
    public void Validator_ChecksTextAndTurnCount(string text, int turnCount, bool valid)
    {
        var turns = Enumerable.Range(0, turnCount).Select(_ => new StudentQuestionTurn("q", "a")).ToList();
        var result = new AskStudentQuestionCommandValidator().Validate(Ask(text, turns: turns));
        Assert.Equal(valid, result.IsValid);
    }

    [Fact]
    public void Validator_RejectsOverlongTextEmptyIdAndOverlongTurns()
    {
        var validator = new AskStudentQuestionCommandValidator();
        Assert.False(validator.Validate(Ask(new string('x', 501))).IsValid);
        Assert.True(validator.Validate(Ask(new string('x', 500))).IsValid);
        Assert.False(validator.Validate(Ask(id: Guid.Empty)).IsValid);
        Assert.False(validator.Validate(Ask(turns: [new StudentQuestionTurn("q", new string('a', 1201))])).IsValid);
        Assert.False(validator.Validate(Ask(turns: [new StudentQuestionTurn("", "a")])).IsValid);
    }

    private sealed class FakeRepository : IStudentAccessRepository
    {
        public Queue<StudentQuestionAccess?> Results { get; } = new();
        public int Checks { get; private set; }

        public Task<StudentQuestionAccess?> FindQuestionAccessAsync(Guid tourId, byte[] tokenHash, DateTimeOffset now,
            CancellationToken ct)
        {
            Checks++;
            return Task.FromResult(Results.Count > 0 ? Results.Dequeue() : Running);
        }

        public Task<Guid?> FindInvitationIdAsync(Guid tourId, byte[] codeHash, CancellationToken ct) => throw new NotSupportedException();
        public Task<Guid?> FindSessionInvitationIdAsync(Guid tourId, byte[] tokenHash, CancellationToken ct) => throw new NotSupportedException();
        public Task<Invitation?> LoadAsync(Guid invitationId, CancellationToken ct) => throw new NotSupportedException();
        public Task CloseExpiredAsync(Guid invitationId, DateTimeOffset now, CancellationToken ct) => throw new NotSupportedException();
        public void Add(BrowserSession session) => throw new NotSupportedException();
        public Task<bool> HasEnteredAsync(Guid invitationId, CancellationToken ct) => throw new NotSupportedException();
        public void AddAudit(AuditLog audit) => throw new NotSupportedException();
    }

    private sealed class FakeAssistant : IAiAssistantClient
    {
        public List<AssistantQuestion> Calls { get; } = [];
        public Exception? Failure { get; set; }

        public Task<AssistantAnswer> AnswerAsync(AssistantQuestion question, CancellationToken ct)
        {
            Calls.Add(question);
            return Failure is null ? Task.FromResult(new AssistantAnswer("Robot dùng LiDAR.", false)) : Task.FromException<AssistantAnswer>(Failure);
        }
    }

    private sealed class FakeCodes : IInvitationCodeService
    {
        public byte[] Hash(string code) => SHA256.HashData(Encoding.UTF8.GetBytes(code));
        public InvitationCode Create(Guid invitationId, int version) => throw new NotSupportedException();
        public string Reveal(Guid invitationId, int version, byte[] protectedCode) => throw new NotSupportedException();
    }

    private sealed class FakeClock : TimeProvider
    {
        private DateTimeOffset now = new(2026, 10, 13, 8, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan by) => now += by;
    }
}
