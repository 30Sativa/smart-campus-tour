using System.Security.Cryptography;
using System.Text;
using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetCamera;
using SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;
using SmartCampus.Application.Features.StreamRelay;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0055: reading the public relay needs a backend token; the NUC keeps publishing with its password.</summary>
public sealed class StreamRelayTests
{
    private const string Robot = "amr_01";
    private const string Key = "relay-key-0123456789-0123456789-abcdef";
    private const string PublishPassword = "nuc-password";
    private static readonly DateTimeOffset Now = new(2026, 11, 11, 10, 0, 0, TimeSpan.Zero);
    private static readonly Guid Session = Guid.Parse("11111111-2222-3333-4444-555555555555");
    private static readonly Guid StaffUser = Guid.Parse("99999999-8888-7777-6666-555555555555");

    private static StreamRelaySettings Settings(string robot = Robot, string key = Key, int tokenSeconds = 120) =>
        new("https://stream.example.test:8889/quest/whep", robot, key, "nuc",
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(PublishPassword))), tokenSeconds: tokenSeconds);

    [Fact]
    public void Token_RoundTrips_AndATamperedOrForeignTokenIsRejected()
    {
        var settings = Settings();
        var token = StreamTokens.Issue(settings, StreamTokenKinds.Student, Session, Robot, Now.AddMinutes(2));

        Assert.Equal(new StreamTokenClaims(StreamTokenKinds.Student, Session, Robot, Now.AddMinutes(2)), StreamTokens.Read(settings, token));
        var parts = token.Split('.');
        parts[2] = Guid.NewGuid().ToString("N");
        Assert.Null(StreamTokens.Read(settings, string.Join('.', parts)));
        Assert.Null(StreamTokens.Read(settings, token[..^2] + (token[^2] == 'A' ? "BB" : "AA")));
        Assert.Null(StreamTokens.Read(Settings(key: "another-relay-key-0123456789-0123456789"), token));
        Assert.Null(StreamTokens.Read(settings, "v1.S.x.y.z.w"));
        Assert.Null(StreamTokens.Read(settings, null));
        Assert.Null(StreamTokens.Read(new StreamRelaySettings(), token));
    }

    [Theory]
    [InlineData("token=abc", "abc")]
    [InlineData("?x=1&token=abc", "abc")]
    [InlineData("tokens=abc", null)]
    [InlineData("", null)]
    public void Token_IsReadFromTheWhepQuery(string query, string? expected) =>
        Assert.Equal(expected, StreamTokens.FromQuery(query));

    [Fact]
    public void Settings_AreAllOrNothing_AndRefuseWeakOrUnsafeValues()
    {
        Assert.False(new StreamRelaySettings().Enabled);
        Assert.True(Settings().Enabled);
        Assert.Throws<InvalidOperationException>(() => new StreamRelaySettings("https://s.test/quest/whep", Robot, null));
        Assert.Throws<InvalidOperationException>(() => new StreamRelaySettings("http://s.test/quest/whep", Robot, Key, "nuc", new string('a', 64)));
        Assert.Throws<InvalidOperationException>(() => new StreamRelaySettings("https://s.test/quest/whep?token=x", Robot, Key, "nuc", new string('a', 64)));
        Assert.Throws<InvalidOperationException>(() => new StreamRelaySettings("https://s.test/quest/whep", Robot, "short", "nuc", new string('a', 64)));
        Assert.Throws<InvalidOperationException>(() => new StreamRelaySettings("https://s.test/quest/whep", Robot, Key, "nuc", "not-a-hash"));
        Assert.Throws<InvalidOperationException>(() => new StreamRelaySettings("https://s.test/quest/whep", Robot, Key));
        Assert.Throws<InvalidOperationException>(() => new StreamRelaySettings(tokenSeconds: 301));
        Assert.Throws<InvalidOperationException>(() => new StreamRelaySettings(tokenSeconds: 29));
    }

    [Fact]
    public async Task Publish_NeedsTheNucCredentials()
    {
        var relay = Relay();
        Assert.Equal(RelayDecision.Allow, await relay.Ask("publish", user: "nuc", password: PublishPassword));
        Assert.Equal(RelayDecision.Deny, await relay.Ask("publish", user: "nuc", password: "wrong"));
        Assert.Equal(RelayDecision.Deny, await relay.Ask("publish", user: "other", password: PublishPassword));
        Assert.Equal(RelayDecision.Deny, await relay.Ask("publish"));
        Assert.Equal(RelayDecision.Deny, await relay.Ask("publish", path: "other", user: "nuc", password: PublishPassword));
    }

    [Fact]
    public async Task ACallerWithoutTheRelayKey_IsNotTheRelay()
    {
        var relay = Relay();
        Assert.Equal(RelayDecision.UnknownCaller, await relay.Ask("publish", key: "wrong", user: "nuc", password: PublishPassword));
        Assert.Equal(RelayDecision.UnknownCaller, await relay.Ask("publish", key: null, user: "nuc", password: PublishPassword));
        var unconfigured = new AuthorizeRelayRequestHandler(new StreamRelaySettings(), Entitlement(new StreamRelaySettings(), new Clock(Now)));
        Assert.Equal(RelayDecision.UnknownCaller, await unconfigured.Handle(new("publish", "publish", "quest", "nuc", PublishPassword, null, null), default));
    }

    [Fact]
    public async Task Read_WithoutAToken_IsRefused()
    {
        var relay = Relay();
        Assert.Equal(RelayDecision.Deny, await relay.Ask("read"));
        Assert.Equal(RelayDecision.Deny, await relay.Ask("read", query: "token=garbage"));
        Assert.Equal(RelayDecision.Deny, await relay.Ask("api"));
        Assert.Equal(RelayDecision.Deny, await relay.Ask("playback"));
    }

    [Fact]
    public async Task Read_WithAStudentToken_FollowsTheSessionsEntitlement()
    {
        var relay = Relay();
        var token = relay.Entitlement.Issue(StreamTokenKinds.Student, Session).Token;

        relay.Reader.Entitled = true;
        Assert.Equal(RelayDecision.Allow, await relay.Ask("read", query: "token=" + token));
        Assert.Equal((Session, Robot), relay.Reader.LastAsked);

        // End Early, a revoked session or a finished Tour: the reader says no.
        relay.Reader.Entitled = false;
        Assert.Equal(RelayDecision.Deny, await relay.Ask("read", query: "token=" + token));
    }

    [Fact]
    public async Task Read_WithAnExpiredToken_IsRefused_ButTheReapersRecheckKeepsAnEntitledViewer()
    {
        var relay = Relay();
        relay.Reader.Entitled = true;
        var token = relay.Entitlement.Issue(StreamTokenKinds.Student, Session).Token;

        relay.Clock.Now = Now.AddSeconds(120);
        Assert.Equal(RelayDecision.Deny, await relay.Ask("read", query: "token=" + token));
        Assert.Equal(RelayDecision.Allow, await relay.Ask("read", query: "token=" + token, recheck: true));

        relay.Reader.Entitled = false;
        Assert.Equal(RelayDecision.Deny, await relay.Ask("read", query: "token=" + token, recheck: true));
    }

    [Fact]
    public async Task Read_WithATokenForAnotherRobot_IsRefused()
    {
        // Correctly signed, but for a robot this relay does not carry.
        var token = StreamTokens.Issue(Settings(), StreamTokenKinds.Student, Session, "amr_02", Now.AddMinutes(2));
        var relay = Relay();
        relay.Reader.Entitled = true;
        Assert.Equal(RelayDecision.Deny, await relay.Ask("read", query: "token=" + token));
        Assert.Null(relay.Reader.LastAsked);
    }

    [Fact]
    public async Task Read_WithAStaffToken_LastsAsLongAsTheCameraLease()
    {
        var relay = Relay();
        relay.Store.ExtendLease(Robot, Now.AddSeconds(120));
        var token = relay.Entitlement.Issue(StreamTokenKinds.Staff, StaffUser).Token;

        Assert.Equal(RelayDecision.Allow, await relay.Ask("read", query: "token=" + token));
        relay.Clock.Now = Now.AddSeconds(121);
        Assert.Equal(RelayDecision.Deny, await relay.Ask("read", query: "token=" + token, recheck: true));
    }

    [Fact]
    public async Task Lease_HandsAStaffTokenForTheRelaysRobotOnly()
    {
        var settings = Settings();
        var clock = new Clock(Now);
        var store = new FakeStore();
        var entitlement = new StreamEntitlement(settings, new FakeReader(), store, clock);

        var status = await new LeaseCameraHandler(store, new FakeRobots(new RobotCameraFacts(Robot, false)), new FleetCameraSettings(), clock, entitlement)
            .Handle(new LeaseCamera(Robot, StaffUser), default);
        Assert.NotNull(status.Stream);
        Assert.Equal("https://stream.example.test:8889/quest/whep", status.Stream!.WhepUrl);
        Assert.Equal(Now.AddSeconds(120), status.Stream.ExpiresAt);
        Assert.Equal(new StreamTokenClaims(StreamTokenKinds.Staff, StaffUser, Robot, Now.AddSeconds(120)), StreamTokens.Read(settings, status.Stream.Token));

        var other = await new LeaseCameraHandler(store, new FakeRobots(new RobotCameraFacts("amr_02", false)), new FleetCameraSettings(), clock, entitlement)
            .Handle(new LeaseCamera("amr_02", StaffUser), default);
        Assert.Null(other.Stream);
    }

    private static StreamEntitlement Entitlement(StreamRelaySettings settings, TimeProvider clock, FakeReader? reader = null, FakeStore? store = null) =>
        new(settings, reader ?? new FakeReader(), store ?? new FakeStore(), clock);

    private static RelayFixture Relay() => new();

    private sealed class RelayFixture
    {
        public Clock Clock { get; } = new(Now);
        public FakeReader Reader { get; } = new();
        public FakeStore Store { get; } = new();
        public StreamRelaySettings Settings { get; } = StreamRelayTests.Settings();
        public StreamEntitlement Entitlement { get; }
        private readonly AuthorizeRelayRequestHandler handler;

        public RelayFixture()
        {
            Entitlement = new StreamEntitlement(Settings, Reader, Store, Clock);
            handler = new AuthorizeRelayRequestHandler(Settings, Entitlement);
        }

        public Task<RelayDecision> Ask(string action, string? key = Key, string path = "quest", string? user = null,
            string? password = null, string? query = null, bool recheck = false) =>
            handler.Handle(new AuthorizeRelayRequest(key, action, path, user, password, null, query, recheck), default);
    }

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class FakeReader : IStreamEntitlementReader
    {
        public bool Entitled { get; set; }
        public (Guid, string)? LastAsked { get; private set; }

        public Task<bool> StudentSessionMayWatchAsync(Guid sessionId, string robotCode, DateTimeOffset now, CancellationToken ct)
        {
            LastAsked = (sessionId, robotCode);
            return Task.FromResult(Entitled);
        }
    }

    private sealed class FakeRobots(RobotCameraFacts? facts) : IRobotCameraReader
    {
        public Task<RobotCameraFacts?> GetAsync(string robotCode, CancellationToken cancellationToken) => Task.FromResult(facts);
    }

    private sealed class FakeStore : ICameraDemandStore
    {
        private readonly Dictionary<string, DateTimeOffset> leases = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, (HeadsetReport, DateTimeOffset)> headsets = new(StringComparer.OrdinalIgnoreCase);
        public void RecordPoll(string robotCode, DateTimeOffset at) { }
        public DateTimeOffset? GetLastPoll(string robotCode) => null;
        public DateTimeOffset ExtendLease(string robotCode, DateTimeOffset until) =>
            leases[robotCode] = leases.TryGetValue(robotCode, out var previous) && previous > until ? previous : until;
        public DateTimeOffset? GetLease(string robotCode) => leases.TryGetValue(robotCode, out var until) ? until : null;
        public void RecordHeadset(string robotCode, HeadsetReport report, DateTimeOffset at) => headsets[robotCode] = (report, at);
        public (HeadsetReport Report, DateTimeOffset At)? GetHeadset(string robotCode) =>
            headsets.TryGetValue(robotCode, out var entry) ? entry : null;
    }
}
