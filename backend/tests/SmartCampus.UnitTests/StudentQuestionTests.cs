using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
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
        public FakeTourReader Tour { get; } = new();
        public FakeRecorder Recorder { get; } = new();
        public StudentQuestionGate Gate { get; }
        public AskStudentQuestionCommandHandler Handler { get; }

        public Harness(bool enabled = true)
        {
            Gate = new StudentQuestionGate(Clock);
            Handler = new AskStudentQuestionCommandHandler(Repository, new FakeCodes(), new InvitationSettings(enabled, 24),
                Assistant, Gate, Clock, Tour, Recorder, NullLogger<AskStudentQuestionCommandHandler>.Instance);
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
    public async Task RobotAtAStop_SnapshotsThatPoi_ForTheAssistantAndTheAnswer()
    {
        var h = new Harness();
        var poiId = Guid.NewGuid();
        h.Tour.Poi = new AssistantPoi(poiId, "Thư viện", "Ba tầng.", "Đây là thư viện.");

        var answer = await h.Handler.Handle(Ask(), CancellationToken.None);

        var sent = Assert.Single(h.Assistant.Calls);
        Assert.Equal(h.Tour.Poi, sent.Poi);
        Assert.Equal(new StudentAnswerPoi(poiId, "Thư viện"), answer.Poi);
        Assert.Equal(TourId, Assert.Single(h.Tour.Lookups));
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
    [InlineData("COMPLETED")]
    [InlineData("CANCELLED")]
    public async Task TourEnded_IsConflict(string state)
    {
        var h = new Harness();
        h.Repository.Results.Enqueue(Running with { TourState = state, ScheduledStartAt = h.Clock.GetUtcNow() });
        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Handler.Handle(Ask(), CancellationToken.None));
        Assert.Equal("TOUR_NOT_RUNNING", error.Code);
        Assert.Empty(h.Assistant.Calls);
    }

    [Theory]
    [InlineData("SCHEDULED")]
    [InlineData("READY")]
    public async Task WaitingRoom_OpensFifteenMinutesBeforeTheStart(string state)
    {
        var h = new Harness();
        var start = h.Clock.GetUtcNow().AddMinutes(16);
        h.Repository.Results.Enqueue(Running with { TourState = state, ScheduledStartAt = start });
        var early = await Assert.ThrowsAsync<ConflictException>(() => h.Handler.Handle(Ask(), CancellationToken.None));
        Assert.Equal("AI_OPENS_LATER", early.Code);
        Assert.Contains("15 phút", early.Message);
        Assert.Empty(h.Assistant.Calls);

        var waiting = Running with { TourState = state, ScheduledStartAt = h.Clock.GetUtcNow().AddMinutes(15) };
        h.Repository.Results.Enqueue(waiting);
        h.Repository.Results.Enqueue(waiting);
        var answer = await h.Handler.Handle(Ask(), CancellationToken.None);
        Assert.Equal("Robot dùng LiDAR.", answer.Answer);
        Assert.Null(Assert.Single(h.Assistant.Calls).Poi); // no stop yet: general campus content
    }

    [Fact]
    public async Task WaitingRoom_StaysOpenPastTheStartUntilTheOperatorStarts()
    {
        var h = new Harness();
        var late = Running with { TourState = "READY", ScheduledStartAt = h.Clock.GetUtcNow().AddMinutes(-5) };
        h.Repository.Results.Enqueue(late);
        h.Repository.Results.Enqueue(late);
        await h.Handler.Handle(Ask(), CancellationToken.None);
        Assert.Single(h.Assistant.Calls);
    }

    [Fact]
    public void Window_IsOpenWhileRunning_AndNotWithoutAStartTimeBeforeIt()
    {
        var now = DateTimeOffset.UnixEpoch.AddDays(1);
        Assert.True(StudentQuestionWindow.IsOpen(Running, now));
        Assert.False(StudentQuestionWindow.IsOpen(Running with { TourState = "READY" }, now));
        Assert.True(StudentQuestionWindow.IsOpen(Running with { TourState = "READY", ScheduledStartAt = now.AddMinutes(15) }, now));
        Assert.False(StudentQuestionWindow.IsOpen(Running with { TourState = "READY", ScheduledStartAt = now.AddMinutes(15).AddSeconds(1) }, now));
        Assert.False(StudentQuestionWindow.IsOpen(Running with { TourState = "COMPLETED", ScheduledStartAt = now }, now));
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
    public async Task AnsweredQuestion_IsCountedOnce_WithoutItsText_AndARepeatIsNotCountedAgain()
    {
        var h = new Harness();
        var id = Guid.NewGuid();
        await h.Handler.Handle(Ask("Robot dùng cảm biến gì?", id), CancellationToken.None);
        await h.Handler.Handle(Ask("Robot dùng cảm biến gì?", id), CancellationToken.None);

        var counted = Assert.Single(h.Recorder.Calls);
        Assert.Equal((TourId, "TOUR", "INDIVIDUAL", false), counted);
    }

    [Fact]
    public async Task WaitingRoomQuestion_IsCountedInTheWaitingRoomPhase()
    {
        var h = new Harness();
        var waiting = Running with { TourState = "READY", ScheduledStartAt = h.Clock.GetUtcNow().AddMinutes(5) };
        h.Repository.Results.Enqueue(waiting);
        h.Repository.Results.Enqueue(waiting);
        await h.Handler.Handle(Ask(), CancellationToken.None);
        Assert.Equal("WAITING_ROOM", Assert.Single(h.Recorder.Calls).Phase);
    }

    [Fact]
    public async Task QuestionsThatGetNoAnswer_AreNotCounted()
    {
        var h = new Harness();
        h.Assistant.Failure = new ServiceUnavailableException("down", "AI_UNAVAILABLE");
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => h.Handler.Handle(Ask(), CancellationToken.None));
        h.Assistant.Failure = null;
        h.Repository.Results.Enqueue(Running);
        h.Repository.Results.Enqueue(null);
        await Assert.ThrowsAsync<UnauthorizedException>(() => h.Handler.Handle(Ask(), CancellationToken.None));
        Assert.Empty(h.Recorder.Calls);
    }

    [Fact]
    public async Task CountingFailure_StillReturnsTheAnswer()
    {
        var h = new Harness();
        h.Recorder.Failure = new InvalidOperationException("sql down");
        var answer = await h.Handler.Handle(Ask(), CancellationToken.None);
        Assert.Equal("Robot dùng LiDAR.", answer.Answer);
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

    [Fact]
    public void Gate_AtomicallyRechecksAnswerWhenReserving_AndValidatesNullTurns()
    {
        var h = new Harness();
        var id = Guid.NewGuid();
        Assert.Null(h.Gate.Enter(SessionId, id, "q"));
        Assert.Throws<TooManyRequestsException>(() => h.Gate.Enter(SessionId, id, "q"));
        var answer = new StudentAnswer(id, "a", false, null, h.Clock.GetUtcNow());
        h.Gate.Remember(SessionId, id, "q", answer);
        h.Gate.Exit(SessionId);
        Assert.Same(answer, h.Gate.Enter(SessionId, id, "q"));
        Assert.False(new AskStudentQuestionCommandValidator().Validate(Ask(turns: [null!])).IsValid);
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
        public Task<Guid?> FindDeviceInvitationIdAsync(Guid tourId, byte[] deviceTokenHash, CancellationToken ct) => throw new NotSupportedException();
        public Task<Invitation?> LoadAsync(Guid invitationId, CancellationToken ct) => throw new NotSupportedException();
        public Task CloseExpiredAsync(Guid invitationId, DateTimeOffset now, CancellationToken ct) => throw new NotSupportedException();
        public void Add(BrowserSession session) => throw new NotSupportedException();
        public Task<bool> HasEnteredAsync(Guid invitationId, CancellationToken ct) => throw new NotSupportedException();
        public void AddAudit(AuditLog audit) => throw new NotSupportedException();
    }

    private sealed class FakeTourReader : IStudentTourViewReader
    {
        public AssistantPoi? Poi { get; set; }
        public List<Guid> Lookups { get; } = [];

        public Task<AssistantPoi?> FindCurrentPoiAsync(Guid tourId, CancellationToken ct)
        {
            Lookups.Add(tourId);
            return Task.FromResult(Poi);
        }

        public Task<StudentTourViewData?> LoadAsync(Guid tourId, CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class FakeRecorder : IStudentQuestionEventRecorder
    {
        public List<(Guid TourId, string Phase, string RowType, bool OutOfScope)> Calls { get; } = [];
        public Exception? Failure { get; set; }

        public Task RecordAsync(Guid tourId, string phase, string rowType, bool outOfScope, CancellationToken ct)
        {
            if (Failure is not null) return Task.FromException(Failure);
            Calls.Add((tourId, phase, rowType, outOfScope));
            return Task.CompletedTask;
        }
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
