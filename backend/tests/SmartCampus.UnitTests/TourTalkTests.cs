using System.Security.Cryptography;
using System.Text;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.TourTalk;
using SmartCampus.Application.Features.TourTalk.Commands.SendStaffTalkMessage;
using SmartCampus.Application.Features.TourTalk.Commands.SendViewerTalkMessage;
using SmartCampus.Application.Features.TourTalk.Queries.GetTourTalk;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0070 Tour talk: who may send, what each side reads, the window and the memory bounds.</summary>
public sealed class TourTalkTests
{
    private static readonly Guid TourId = Guid.NewGuid();
    private static readonly Guid Operator = Guid.NewGuid();
    private static readonly Guid OtherStaff = Guid.NewGuid();
    private static readonly Guid RowA = Guid.NewGuid();
    private static readonly Guid RowB = Guid.NewGuid();

    private sealed class Harness
    {
        public FakeClock Clock { get; } = new();
        public FakeReader Reader { get; } = new();
        public TourTalkStore Store { get; }
        private readonly FakeCodes codes = new();
        private readonly InvitationSettings settings = new(true, 24);

        public Harness()
        {
            Store = new TourTalkStore(Clock);
            Reader.Tour = new TourTalkTour(TourId, "RUNNING", Clock.GetUtcNow().AddMinutes(-10), Operator, "Lan Staff");
            Reader.Viewers["token-a"] = new TourTalkViewer(RowA, "Nguyễn An", "12A1", "INDIVIDUAL", "RUNNING", Clock.GetUtcNow());
            Reader.Viewers["token-b"] = new TourTalkViewer(RowB, "Phòng chiếu B", null, "SHARED_VIEWING", "RUNNING", Clock.GetUtcNow());
        }

        public void SetState(string state) => Reader.State = state;

        public Task<TourTalkMessageView> Staff(Guid actor, string? text = "Các bạn muốn đi đâu tiếp?", byte[]? audio = null) =>
            new SendStaffTalkMessageCommandHandler(Reader, Store, Clock).Handle(new SendStaffTalkMessageCommand(TourId, actor, text, audio,
                audio is null ? null : "audio/webm;codecs=opus", audio is null ? null : 1500), default);

        public Task<TourTalkMessageView> Viewer(string token, string text = "Thư viện ạ") =>
            new SendViewerTalkMessageCommandHandler(Reader, codes, settings, Store, Clock)
                .Handle(new SendViewerTalkMessageCommand(TourId, token, text), default);

        private GetTourTalkQueryHandlers Queries => new(Reader, codes, settings, Store, Clock);

        public Task<TourTalkFeed> StaffFeed(Guid actor, Guid? epoch = null, long after = 0) =>
            Queries.Handle(new GetStaffTourTalkQuery(TourId, actor, epoch, after), default);

        public Task<TourTalkFeed> ViewerFeed(string token, Guid? epoch = null, long after = 0) =>
            Queries.Handle(new GetViewerTourTalkQuery(TourId, token, epoch, after), default);

        public Task<TourTalkAudio> ViewerAudio(string token, Guid messageId) =>
            Queries.Handle(new GetViewerTourTalkAudioQuery(TourId, token, messageId), default);
    }

    [Fact]
    public async Task OnlyTheOperator_Sends_OtherStaffOnlyRead()
    {
        var h = new Harness();
        await Assert.ThrowsAsync<ForbiddenException>(() => h.Staff(OtherStaff));
        var sent = await h.Staff(Operator);

        Assert.Equal(TourTalkSenders.Staff, sent.From);
        Assert.Equal("Lan Staff", sent.StaffName);
        var other = await h.StaffFeed(OtherStaff);
        Assert.False(other.CanSend);
        Assert.Single(other.Messages);
        Assert.True((await h.StaffFeed(Operator)).CanSend);
    }

    [Fact]
    public async Task Viewers_ReadTheOperatorAndTheirOwnReplies_NeverAnotherRow()
    {
        var h = new Harness();
        await h.Staff(Operator);
        await h.Viewer("token-a", "Thư viện ạ");
        await h.Viewer("token-b", "Phòng lab");

        var a = await h.ViewerFeed("token-a");
        Assert.Equal(2, a.Messages.Count);
        Assert.Contains(a.Messages, message => message.From == TourTalkSenders.Viewer && message.Mine && message.Text == "Thư viện ạ");
        Assert.DoesNotContain(a.Messages, message => message.Text == "Phòng lab");
        Assert.All(a.Messages, message => Assert.Null(message.ViewerName));

        var staff = await h.StaffFeed(Operator);
        Assert.Equal(3, staff.Messages.Count);
        Assert.Contains(staff.Messages, message => message.ViewerName == "Phòng chiếu B" && message.ViewerRowType == "SHARED_VIEWING");
    }

    [Fact]
    public async Task AnUnknownSession_IsRefused()
    {
        var h = new Harness();
        await Assert.ThrowsAsync<UnauthorizedException>(() => h.Viewer("revoked"));
        await Assert.ThrowsAsync<UnauthorizedException>(() => h.ViewerFeed(""));
    }

    [Fact]
    public async Task AfterAndEpoch_ReturnOnlyNewMessages_UntilTheEpochChanges()
    {
        var h = new Harness();
        await h.Staff(Operator, "Một");
        var first = await h.StaffFeed(Operator);
        await h.Staff(Operator, "Hai");

        var next = await h.StaffFeed(Operator, first.Epoch, first.LastSeq);
        Assert.Equal("Hai", Assert.Single(next.Messages).Text);
        Assert.Equal(2, (await h.StaffFeed(Operator, Guid.NewGuid(), first.LastSeq)).Messages.Count);
    }

    [Fact]
    public async Task TheWindow_OpensFifteenMinutesBeforeTheStart_AndClosesWhenTheTourEnds()
    {
        var h = new Harness();
        h.Reader.ScheduledStartAt = h.Clock.GetUtcNow().AddMinutes(20);
        h.SetState("READY");
        var early = await Assert.ThrowsAsync<ConflictException>(() => h.Staff(Operator));
        Assert.Equal(TourTalkWindow.OpensLaterCode, early.Code);
        Assert.False((await h.ViewerFeed("token-a")).CanSend);

        h.Clock.Advance(TimeSpan.FromMinutes(6));
        await h.Staff(Operator);
        await h.Viewer("token-a");

        h.SetState("COMPLETED");
        var closed = await Assert.ThrowsAsync<ConflictException>(() => h.Viewer("token-a"));
        Assert.Equal(TourTalkWindow.ClosedCode, closed.Code);
        Assert.Equal(2, (await h.StaffFeed(Operator)).Messages.Count);
    }

    [Fact]
    public async Task AViewer_SendsAtMostSixMessagesAMinute()
    {
        var h = new Harness();
        for (var i = 0; i < TourTalkLimits.ViewerMessagesPerMinute; i++) await h.Viewer("token-a", $"Tin {i}");
        await Assert.ThrowsAsync<TooManyRequestsException>(() => h.Viewer("token-a"));
        await h.Viewer("token-b");
        h.Clock.Advance(TimeSpan.FromMinutes(1));
        await h.Viewer("token-a");
    }

    [Fact]
    public async Task VoiceClips_AreServedToViewers_AndOldOnesAreDropped()
    {
        var h = new Harness();
        var first = await h.Staff(Operator, null, [1, 2, 3]);
        Assert.True(first.HasAudio && first.AudioAvailable);
        var audio = await h.ViewerAudio("token-a", first.Id);
        Assert.Equal("audio/webm", audio.ContentType);
        Assert.Equal(new byte[] { 1, 2, 3 }, audio.Content);

        for (var i = 0; i < TourTalkLimits.MaxAudioClipsPerTour; i++) await h.Staff(Operator, null, [9]);
        await Assert.ThrowsAsync<NotFoundException>(() => h.ViewerAudio("token-a", first.Id));
        var kept = (await h.StaffFeed(Operator)).Messages.Single(message => message.Id == first.Id);
        Assert.True(kept.HasAudio);
        Assert.False(kept.AudioAvailable);
    }

    [Fact]
    public async Task AViewer_CannotFetchAnotherRowsMessage()
    {
        var h = new Harness();
        var reply = await h.Viewer("token-b");
        await Assert.ThrowsAsync<NotFoundException>(() => h.ViewerAudio("token-a", reply.Id));
    }

    [Fact]
    public void TheStaffValidator_NeedsTextOrAClip_WithinLimits()
    {
        var validator = new SendStaffTalkMessageCommandValidator();
        Assert.False(validator.Validate(new SendStaffTalkMessageCommand(TourId, Operator, "  ", null, null, null)).IsValid);
        Assert.True(validator.Validate(new SendStaffTalkMessageCommand(TourId, Operator, "Xin chào", null, null, null)).IsValid);
        Assert.True(validator.Validate(new SendStaffTalkMessageCommand(TourId, Operator, null, [1], "audio/ogg", 2000)).IsValid);
        Assert.False(validator.Validate(new SendStaffTalkMessageCommand(TourId, Operator, null, [1], "video/mp4", 2000)).IsValid);
        Assert.False(validator.Validate(new SendStaffTalkMessageCommand(TourId, Operator, null, [1], "audio/webm", 31_000)).IsValid);
        Assert.False(validator.Validate(new SendStaffTalkMessageCommand(TourId, Operator,
            new string('a', TourTalkLimits.MaxTextLength + 1), null, null, null)).IsValid);
    }

    private sealed class FakeReader : ITourTalkReader
    {
        public TourTalkTour? Tour { get; set; }
        public Dictionary<string, TourTalkViewer> Viewers { get; } = new();
        public string? State { get; set; }
        public DateTimeOffset? ScheduledStartAt { get; set; }
        private readonly FakeCodes codes = new();

        public Task<TourTalkTour?> GetTourAsync(Guid tourId, CancellationToken ct) =>
            Task.FromResult(Tour is null || tourId != Tour.TourId ? null
                : Tour with { State = State ?? Tour.State, ScheduledStartAt = ScheduledStartAt ?? Tour.ScheduledStartAt });

        public Task<TourTalkViewer?> FindViewerAsync(Guid tourId, byte[] tokenHash, DateTimeOffset now, CancellationToken ct)
        {
            var match = Viewers.FirstOrDefault(item => codes.Hash("browser-session:" + item.Key).SequenceEqual(tokenHash)).Value;
            return Task.FromResult(match is null ? null
                : match with { TourState = State ?? match.TourState, ScheduledStartAt = ScheduledStartAt ?? match.ScheduledStartAt });
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
        private DateTimeOffset now = new(2026, 11, 25, 8, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan by) => now += by;
    }
}
