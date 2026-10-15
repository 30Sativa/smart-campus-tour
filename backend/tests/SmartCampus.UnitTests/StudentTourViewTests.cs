using System.Security.Cryptography;
using System.Text;
using SmartCampus.Application.Common.Abstractions.Assistant;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.StudentTour;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class StudentTourViewTests
{
    private static readonly Guid TourId = Guid.NewGuid();
    private static readonly Guid LibraryId = Guid.NewGuid();
    private static readonly Guid LabId = Guid.NewGuid();

    private static StudentTourViewData Data(string state, string? step = null, string? status = null,
        Guid? current = null, Guid? last = null, bool held = false, string? audio = null) =>
        new(state, step, status, held, current, last,
        [
            new StudentTourStopData(1, LibraryId, "Thư viện", "Ba tầng.", "Đây là thư viện.", audio, 40, 120),
            new StudentTourStopData(2, LabId, "AI Lab", null, null, null, null, 90),
        ]);

    private static GetStudentTourViewQueryHandler Handler(FakeAccess access, FakeReader reader, bool enabled = true) =>
        new(access, reader, new FakeCodes(), new InvitationSettings(enabled, 24), TimeProvider.System);

    [Fact]
    public async Task ValidSession_ReturnsStopsInOrder_AndNoProgressBeforeTheTourRuns()
    {
        var reader = new FakeReader { Data = Data("SCHEDULED", step: "NAVIGATING", current: LibraryId) };
        var view = await Handler(new FakeAccess(), reader).Handle(new GetStudentTourViewQuery(TourId, "token"), CancellationToken.None);

        Assert.Equal(new[] { 1, 2 }, view.Stops.Select(s => s.Order));
        Assert.Equal("Thư viện", view.Stops[0].Name);
        Assert.Equal("Đây là thư viện.", view.Stops[0].NarrationText);
        Assert.Equal(120, view.Stops[0].DwellSeconds);
        Assert.Null(view.Progress);
    }

    [Fact]
    public async Task RunningTour_CopiesItsProgressColumns()
    {
        var reader = new FakeReader { Data = Data("RUNNING", "OBSERVING", "NEEDS_ASSISTANCE", LabId, LibraryId, held: true) };
        var view = await Handler(new FakeAccess(), reader).Handle(new GetStudentTourViewQuery(TourId, "token"), CancellationToken.None);

        Assert.Equal(new StudentTourProgress("OBSERVING", LabId, LibraryId, true, true), view.Progress);
    }

    [Theory]
    [InlineData(null, true, true)]
    [InlineData("", true, true)]
    [InlineData("token", false, true)]
    [InlineData("token", true, false)]
    public async Task MissingCookie_DisabledInvitations_OrClosedSession_AreUnauthorized(string? token, bool enabled, bool sessionOpen)
    {
        var access = new FakeAccess();
        if (!sessionOpen) access.Access = null;
        var reader = new FakeReader { Data = Data("RUNNING") };
        await Assert.ThrowsAsync<UnauthorizedException>(() =>
            Handler(access, reader, enabled).Handle(new GetStudentTourViewQuery(TourId, token), CancellationToken.None));
        Assert.Equal(0, reader.Loads);
    }

    [Theory]
    [InlineData("https://cdn.example.edu/audio/thu-vien.mp3", "https://cdn.example.edu/audio/thu-vien.mp3")]
    [InlineData("/audio/thu-vien.mp3", "/audio/thu-vien.mp3")]
    [InlineData("  /audio/a.mp3 ", "/audio/a.mp3")]
    [InlineData("http://cdn.example.edu/a.mp3", null)]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("//evil.example/a.mp3", null)]
    [InlineData("https://user:pass@cdn.example.edu/a.mp3", null)]
    [InlineData("audio/a.mp3", null)]
    [InlineData("   ", null)]
    public void AudioUrl_IsPassedOnOnlyWhenHttpsOrSameSitePath(string url, string? expected) =>
        Assert.Equal(expected, GetStudentTourViewQueryHandler.SafeAudioUrl(url));

    private sealed class FakeReader : IStudentTourViewReader
    {
        public StudentTourViewData? Data { get; set; }
        public int Loads { get; private set; }

        public Task<StudentTourViewData?> LoadAsync(Guid tourId, CancellationToken ct)
        {
            Loads++;
            return Task.FromResult(Data);
        }

        public Task<AssistantPoi?> FindCurrentPoiAsync(Guid tourId, CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class FakeAccess : IStudentAccessRepository
    {
        public StudentQuestionAccess? Access { get; set; } = new(Guid.NewGuid(), "SCHEDULED", "INDIVIDUAL");

        public Task<StudentQuestionAccess?> FindQuestionAccessAsync(Guid tourId, byte[] tokenHash, DateTimeOffset now,
            CancellationToken ct) => Task.FromResult(Access);

        public Task<Guid?> FindInvitationIdAsync(Guid tourId, byte[] codeHash, CancellationToken ct) => throw new NotSupportedException();
        public Task<Guid?> FindSessionInvitationIdAsync(Guid tourId, byte[] tokenHash, CancellationToken ct) => throw new NotSupportedException();
        public Task<Invitation?> LoadAsync(Guid invitationId, CancellationToken ct) => throw new NotSupportedException();
        public Task CloseExpiredAsync(Guid invitationId, DateTimeOffset now, CancellationToken ct) => throw new NotSupportedException();
        public void Add(BrowserSession session) => throw new NotSupportedException();
        public Task<bool> HasEnteredAsync(Guid invitationId, CancellationToken ct) => throw new NotSupportedException();
        public void AddAudit(AuditLog audit) => throw new NotSupportedException();
    }

    private sealed class FakeCodes : IInvitationCodeService
    {
        public byte[] Hash(string code) => SHA256.HashData(Encoding.UTF8.GetBytes(code));
        public InvitationCode Create(Guid invitationId, int version) => throw new NotSupportedException();
        public string Reveal(Guid invitationId, int version, byte[] protectedCode) => throw new NotSupportedException();
    }
}
