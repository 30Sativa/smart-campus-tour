using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Api.Controllers;
using SmartCampus.Api.Hubs;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Authentication;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// A fake bridge against the real API process, built from docs/contracts/fleet-commands/v1 (ADR-0043 D10): it reports
/// through Fleet Sync, polls and posts the fixture bodies with real ids.
/// </summary>
public sealed class FleetCommandsHttpTests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    [Fact]
    public void Fixtures_UseTheValuesTheBackendStores()
    {
        Assert.Equal(RobotCommandKinds.GoTo, Fixture("poll-response-goto.json")["data"]!["command"]!["kind"]!.GetValue<string>());
        Assert.Equal(RobotCommandKinds.Cancel, Fixture("poll-response-cancel.json")["data"]!["command"]!["kind"]!.GetValue<string>());
        Assert.Equal(RobotCommandStates.Arrived, Fixture("result-terminal-arrived.json")["outcome"]!.GetValue<string>());
        Assert.Null(JsonSerializer.Deserialize<FleetCommandPollResponse>(Fixture("poll-response-empty.json")["data"]!.ToJsonString(), Web)!.Command);
        var request = JsonSerializer.Deserialize<FleetCommandPollRequest>(Fixture("poll-request.json").ToJsonString(), Web)!;
        Assert.NotEqual(Guid.Empty, request.StreamId);
        foreach (var name in new[] { "result-accepted.json", "result-rejected.json", "result-terminal-arrived.json" })
            Assert.NotEqual(Guid.Empty, JsonSerializer.Deserialize<FleetCommandResultRequest>(Fixture(name).ToJsonString(), Web)!.CommandId);
    }

    [Fact]
    public void ConsolePresence_CountsEachConnection_AndFailsClosed()
    {
        var presence = new HubOperatorConsolePresence();
        var id = Guid.NewGuid();
        var user = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
            [new System.Security.Claims.Claim("sub", id.ToString("D"))]));
        Assert.False(presence.IsConnected(id));
        presence.Connected(user);
        presence.Connected(user);
        presence.Disconnected(user);
        Assert.True(presence.IsConnected(id));
        presence.Disconnected(user);
        Assert.False(presence.IsConnected(id));
    }

    [SchemaV11Fact]
    public async Task Authentication_RefusesMissingOrWrongCredentials_UserTokens_AndAnotherRobotsCommand()
    {
        await using var b = await Bridge.Create();
        await b.StartTour();
        await b.Sync();
        var command = (await b.PollData()).GetProperty("command");
        var results = $"/api/fleet/commands/v1/{command.GetProperty("commandId").GetGuid()}/results";

        Assert.Equal(HttpStatusCode.Unauthorized, (await b.Post("/api/fleet/commands/v1/poll", new { streamId = b.Stream }, credential: null)).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await b.Post("/api/fleet/commands/v1/poll", new { streamId = b.Stream }, credential: "wrong")).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await b.Post("/api/fleet/commands/v1/poll", new { streamId = b.Stream }, credential: b.OperatorToken)).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await b.Post(results, b.ResultBody(command, "result-accepted.json"), credential: b.OperatorToken)).Status);

        var other = FleetRobotCredentialHash.Create();
        var robotId = Guid.NewGuid();
        await b.W.H.Database.ExecuteAsync($"""
            INSERT dbo.Robots(Id,RobotCode,SourceType,CredentialHash,IsDispatchEnabled,NeedsInspection,CreatedAt)
            VALUES('{robotId}',N'amr_other','PHYSICAL',0x{Convert.ToHexString(other.Hash)},0,0,SYSDATETIMEOFFSET());
            """);
        var refused = await b.Post(results, b.ResultBody(command, "result-accepted.json"), credential: other.Secret, robotCode: "amr_other");
        Assert.Equal(HttpStatusCode.NotFound, refused.Status);
        Assert.Equal("COMMAND_NOT_FOUND", Code(refused.Body));
    }

    [SchemaV11Fact]
    public async Task Poll_FollowsTheContract()
    {
        await using var b = await Bridge.Create();
        await b.Sync();
        var empty = await b.Post("/api/fleet/commands/v1/poll", new { streamId = b.Stream });
        Assert.Equal(HttpStatusCode.OK, empty.Status);
        AssertSameShape(Fixture("poll-response-empty.json"), empty.Body);

        // A command that is not delivered costs nothing: the robot just polls again.
        var wrong = await b.Post("/api/fleet/commands/v1/poll", new { streamId = Guid.NewGuid() });
        Assert.Equal((HttpStatusCode.Conflict, "STREAM_NOT_CURRENT"), (wrong.Status, Code(wrong.Body)));

        await b.StartTour();
        await b.Sync();
        var goTo = await b.Post("/api/fleet/commands/v1/poll", new { streamId = b.Stream });
        AssertSameShape(Fixture("poll-response-goto.json"), goTo.Body);
        var command = goTo.Body.GetProperty("data").GetProperty("command");
        Assert.Equal("GoTo", command.GetProperty("kind").GetString());
        await using (var db = b.W.H.Context())
        {
            var stored = await db.RobotCommands.AsNoTracking().SingleAsync();
            Assert.Equal(("DELIVERED", (Guid?)b.Stream), (stored.State, stored.DeliveredStreamId));
            Assert.Equal((stored.Id, stored.LegId, (double)stored.X!, stored.MapKey),
                (command.GetProperty("commandId").GetGuid(), command.GetProperty("legId").GetGuid(), command.GetProperty("x").GetDouble(), command.GetProperty("mapKey").GetString()));
        }

        var again = await b.PollData();
        Assert.Equal(command.GetProperty("commandId").GetGuid(), again.GetProperty("command").GetProperty("commandId").GetGuid());
        await using (var db = b.W.H.Context())
            Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == "COMMAND_DELIVERED").ToArrayAsync());

        // A new stream never receives what the old one received.
        b.RestartBridge();
        await b.Sync();
        Assert.Equal(JsonValueKind.Null, (await b.PollData()).GetProperty("command").ValueKind);
        await using var after = b.W.H.Context();
        var unknown = await after.RobotCommands.AsNoTracking().SingleAsync();
        Assert.Equal(("UNKNOWN", "STREAM_CHANGED"), (unknown.State, unknown.ReasonCode));
        Assert.Equal("CommandUnknown", (await after.Tours.AsNoTracking().SingleAsync(t => t.Id == b.W.H.TourId)).AssistanceReason);
    }

    [SchemaV11Fact]
    public async Task Poll_RefusesStaleTelemetry()
    {
        await using var b = await Bridge.Create(maxTelemetryAgeSeconds: 1);
        await b.Sync();
        await Task.Delay(TimeSpan.FromMilliseconds(1300));
        var stale = await b.Post("/api/fleet/commands/v1/poll", new { streamId = b.Stream });
        Assert.Equal((HttpStatusCode.Conflict, "STREAM_NOT_CURRENT"), (stale.Status, Code(stale.Body)));
    }

    [SchemaV11Fact]
    public async Task Poll_DoesNotDeliverAGoToToARobotThatMayNotBeDispatched_ButStillDeliversACancel()
    {
        await using var b = await Bridge.Create();
        await b.StartTour();
        await b.W.H.Database.ExecuteAsync("UPDATE dbo.Robots SET IsDispatchEnabled = 0;");
        await b.Sync();
        Assert.Equal(JsonValueKind.Null, (await b.PollData()).GetProperty("command").ValueKind);
        await using (var db = b.W.H.Context())
            Assert.Equal("PENDING", (await db.RobotCommands.AsNoTracking().SingleAsync()).State);

        await b.W.H.Database.ExecuteAsync("UPDATE dbo.Robots SET IsDispatchEnabled = 1;");
        await b.Sync();
        var goTo = (await b.PollData()).GetProperty("command");
        Assert.Equal("GoTo", goTo.GetProperty("kind").GetString());
        await b.W.H.Database.ExecuteAsync("UPDATE dbo.Robots SET IsDispatchEnabled = 0;");
        await b.StaffPost("end-early", new { requestId = Guid.NewGuid(), expectedRowVersion = await b.TourVersion(), reason = "Mưa lớn" });

        await b.Sync();
        var cancel = await b.Post("/api/fleet/commands/v1/poll", new { streamId = b.Stream });
        AssertSameShape(Fixture("poll-response-cancel.json"), cancel.Body);
        Assert.Equal(goTo.GetProperty("legId").GetGuid(), cancel.Body.GetProperty("data").GetProperty("command").GetProperty("legId").GetGuid());
    }

    [SchemaV11Fact]
    public async Task EndpointsAnswer503_WhileCommandsAreOff_AndFleetSyncStaysTelemetryOnly()
    {
        await using var b = await Bridge.Create(enabled: false);
        var sync = await b.Sync();
        Assert.Equal(JsonValueKind.Array, sync.GetProperty("data").GetProperty("commands").ValueKind);
        Assert.Equal(0, sync.GetProperty("data").GetProperty("commands").GetArrayLength());

        var poll = await b.Post("/api/fleet/commands/v1/poll", new { streamId = b.Stream });
        Assert.Equal((HttpStatusCode.ServiceUnavailable, "COMMAND_TRANSPORT_DISABLED"), (poll.Status, Code(poll.Body)));
        var id = Guid.NewGuid();
        var body = Fixture("result-accepted.json");
        body["commandId"] = id;
        var result = await b.Post($"/api/fleet/commands/v1/{id}/results", body);
        Assert.Equal((HttpStatusCode.ServiceUnavailable, "COMMAND_TRANSPORT_DISABLED"), (result.Status, Code(result.Body)));
    }

    [SchemaV11Fact]
    public async Task Results_FollowTheContract_AndALostAckHasOneEffect()
    {
        await using var b = await Bridge.Create();
        await b.StartTour();
        await b.Sync();
        var command = (await b.PollData()).GetProperty("command");
        var path = $"/api/fleet/commands/v1/{command.GetProperty("commandId").GetGuid()}/results";

        var mismatch = b.ResultBody(command, "result-accepted.json");
        mismatch["commandId"] = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.BadRequest, (await b.Post(path, mismatch)).Status);

        var accepted = b.ResultBody(command, "result-accepted.json");
        var first = await b.Post(path, accepted);
        Assert.Equal(HttpStatusCode.OK, first.Status);
        Assert.Equal((true, false, "ACCEPTED"), Ack(first.Body));
        // The acknowledgement was lost: the bridge sends the exact body again.
        Assert.Equal((true, true, "ACCEPTED"), Ack((await b.Post(path, accepted)).Body));

        var changed = b.ResultBody(command, "result-accepted.json");
        changed["reportedAt"] = DateTimeOffset.UtcNow.AddHours(1);
        var conflict = await b.Post(path, changed);
        Assert.Equal((HttpStatusCode.Conflict, "RESULT_CONFLICT"), (conflict.Status, Code(conflict.Body)));
        var phase = await b.Post(path, b.ResultBody(command, "result-rejected.json"));
        Assert.Equal((HttpStatusCode.Conflict, "RESULT_PHASE_NOT_ALLOWED"), (phase.Status, Code(phase.Body)));
        var stream = b.ResultBody(command, "result-accepted.json");
        stream["streamId"] = Guid.NewGuid();
        stream["reportedAt"] = DateTimeOffset.UtcNow;
        Assert.Equal("RESULT_STREAM_MISMATCH", Code((await b.Post(path, stream)).Body));

        var terminal = b.ResultBody(command, "result-terminal-arrived.json");
        Assert.Equal((true, false, "ARRIVED"), Ack((await b.Post(path, terminal)).Body));
        Assert.Equal((true, true, "ARRIVED"), Ack((await b.Post(path, terminal)).Body));

        await using var db = b.W.H.Context();
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == "LEG_TERMINAL").ToArrayAsync());
        Assert.Equal("OBSERVING", (await db.Tours.AsNoTracking().SingleAsync(t => t.Id == b.W.H.TourId)).CurrentStep);
    }

    [SchemaV11Fact]
    public async Task AWholeTour_RunsOverHttp_FromStaffStartToTheRobotsRelease()
    {
        await using var b = await Bridge.Create();
        await b.StartTour();
        foreach (var leg in new[] { "first POI", "second POI", "end pose" })
        {
            await b.Sync(status: "IDLE");
            var command = (await b.PollData()).GetProperty("command");
            Assert.Equal(leg == "end pose" ? JsonValueKind.Null : JsonValueKind.String, command.GetProperty("stopId").ValueKind);
            var path = $"/api/fleet/commands/v1/{command.GetProperty("commandId").GetGuid()}/results";
            Assert.Equal(HttpStatusCode.OK, (await b.Post(path, b.ResultBody(command, "result-accepted.json"))).Status);
            Assert.Equal(HttpStatusCode.OK, (await b.Post(path, b.ResultBody(command, "result-terminal-arrived.json"))).Status);
            if (leg == "end pose") break;
            await b.Sync();
            await b.StaffPost("next", new { requestId = Guid.NewGuid(), expectedRowVersion = await b.TourVersion() });
        }

        await using var db = b.W.H.Context();
        Assert.Equal("COMPLETED", (await db.Tours.AsNoTracking().SingleAsync(t => t.Id == b.W.H.TourId)).State);
        Assert.Null((await db.Robots.AsNoTracking().SingleAsync()).CurrentTourId);
        Assert.Equal(0, await db.RobotCommands.CountAsync(c => c.IsOpen));
    }

    private static JsonNode Fixture(string name) => JsonNode.Parse(File.ReadAllText(
        Path.Combine(AppContext.BaseDirectory, "ContractFixtures", "fleet-commands", "v1", name)))!;

    private static string? Code(JsonElement body) => body.GetProperty("errors").GetProperty("code").GetString();

    private static (bool, bool, string?) Ack(JsonElement body)
    {
        var data = body.GetProperty("data");
        return (data.GetProperty("accepted").GetBoolean(), data.GetProperty("duplicate").GetBoolean(), data.GetProperty("commandState").GetString());
    }

    /// <summary>Same keys, in depth, as the contract fixture; values differ by nature.</summary>
    private static void AssertSameShape(JsonNode expected, JsonElement actual)
    {
        if (expected is not JsonObject properties) return;
        Assert.Equal(properties.Select(item => item.Key).Order(), actual.EnumerateObject().Select(item => item.Name).Order());
        foreach (var (name, value) in properties)
            if (value is JsonObject) AssertSameShape(value, actual.GetProperty(name));
    }

    /// <summary>The bridge's side of the wire, against a real API process on the World's database.</summary>
    private sealed class Bridge(World world, PoiManagementEndpointTests.ApiHost host, string secret, string operatorToken, ClientWebSocket? console) : IAsyncDisposable
    {
        private long seq;
        private long tick;
        public World W => world;
        public string OperatorToken => operatorToken;
        public Guid Stream { get; private set; } = Guid.NewGuid();
        private string mapKey = "";

        public static async Task<Bridge> Create(bool enabled = true, int maxTelemetryAgeSeconds = 30)
        {
            var world = await World.Create(report: false, enabled: true, twoStopsToEndPose: true);
            var credential = FleetRobotCredentialHash.Create();
            await world.H.Database.ExecuteAsync($"UPDATE dbo.Robots SET CredentialHash = 0x{Convert.ToHexString(credential.Hash)};");
            // The real process has the real clock, so the Tour's window opens now.
            await world.H.Database.ExecuteAsync("UPDATE dbo.Tours SET ScheduledStartAt = DATEADD(MINUTE, -1, SYSDATETIMEOFFSET());");
            var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(world.H.Database.ConnectionString, new Dictionary<string, string>
            {
                ["FleetCommands__Enabled"] = enabled ? "true" : "false",
                ["FleetCommands__MaxTelemetryAgeSeconds"] = maxTelemetryAgeSeconds.ToString(),
                // The sweeper is covered on its own; a slow test machine must not expire these commands.
                ["FleetCommands__AcceptWindowSeconds"] = "300"
            });
            var token = await RepresentativeEndpointTests.LoginAsync(host.Client, "ready.operator");
            var bridge = new Bridge(world, host, credential.Secret, token, await OpenConsole(host, token));
            await using var db = world.H.Context();
            bridge.mapKey = (await db.MapVersions.AsNoTracking().SingleAsync()).MapKey;
            return bridge;
        }

        /// <summary>An Operator console: an open /hubs/operations connection, which the Start check counts.</summary>
        private static async Task<ClientWebSocket> OpenConsole(PoiManagementEndpointTests.ApiHost host, string token)
        {
            using var negotiate = await host.Client.PostAsync("/hubs/operations/negotiate?negotiateVersion=1&access_token=" + Uri.EscapeDataString(token), null);
            negotiate.EnsureSuccessStatusCode();
            using var body = JsonDocument.Parse(await negotiate.Content.ReadAsStringAsync());
            var uri = new UriBuilder(host.Client.BaseAddress!)
            {
                Scheme = "ws", Path = "/hubs/operations",
                Query = $"id={Uri.EscapeDataString(body.RootElement.GetProperty("connectionToken").GetString()!)}&access_token={Uri.EscapeDataString(token)}"
            }.Uri;
            var socket = new ClientWebSocket();
            await socket.ConnectAsync(uri, CancellationToken.None);
            await socket.SendAsync(Encoding.UTF8.GetBytes("{\"protocol\":\"json\",\"version\":1}\u001e"), WebSocketMessageType.Text, true, CancellationToken.None);
            var buffer = new byte[4096];
            await socket.ReceiveAsync(buffer.AsMemory(), CancellationToken.None); // Handshake answer: the hub has run OnConnected.
            return socket;
        }

        public void RestartBridge()
        {
            Stream = Guid.NewGuid();
            seq = 0;
        }

        public async Task<JsonElement> Sync(string status = "IDLE")
        {
            seq++;
            tick++;
            var now = DateTimeOffset.UtcNow.AddMilliseconds(-10);
            var reply = await Post("/api/fleet/v1/sync", new FleetSyncRequest(TourReadySqlTests.Robot, Stream, seq, now.AddMilliseconds(tick), mapKey, "map",
                new FleetPoseRequest(1, 1, 0, now), status, null, true, true, null, 80));
            Assert.True(reply.Status == HttpStatusCode.OK, reply.Body.ToString());
            return reply.Body;
        }

        public async Task<JsonElement> PollData()
        {
            var reply = await Post("/api/fleet/commands/v1/poll", new { streamId = Stream });
            Assert.True(reply.Status == HttpStatusCode.OK, reply.Body.ToString());
            return reply.Body.GetProperty("data");
        }

        public JsonNode ResultBody(JsonElement command, string fixture)
        {
            var body = Fixture(fixture);
            body["commandId"] = command.GetProperty("commandId").GetGuid();
            body["legId"] = command.GetProperty("legId").GetGuid();
            body["streamId"] = Stream;
            return body;
        }

        public async Task<string> TourVersion()
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"/api/staff/manage/tours/{world.H.TourId}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", operatorToken);
            using var response = await host.Client.SendAsync(request);
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return body.RootElement.GetProperty("data").GetProperty("tour").GetProperty("rowVersion").GetString()!;
        }

        public async Task StartTour()
        {
            await Sync();
            await StaffPost("start", new
            {
                requestId = Guid.NewGuid(), expectedRowVersion = await TourVersion(),
                confirmation = new { robotPlaced = true, areaClear = true, attendantPresent = true, previewChecked = true }
            });
        }

        public async Task StaffPost(string action, object body)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/staff/manage/tours/{world.H.TourId}/{action}") { Content = JsonContent.Create(body) };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", operatorToken);
            using var response = await host.Client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            Assert.True(response.IsSuccessStatusCode, $"{action}: {response.StatusCode} {text}");
        }

        private const string UseOwnCredential = "\0";

        public async Task<(HttpStatusCode Status, JsonElement Body)> Post(string path, object body, string? credential = UseOwnCredential, string robotCode = TourReadySqlTests.Robot)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, path)
            {
                Content = new StringContent(body is JsonNode node ? node.ToJsonString() : JsonSerializer.Serialize(body, body.GetType(), Web), Encoding.UTF8, "application/json")
            };
            request.Headers.Add("X-Robot-Code", robotCode);
            if (credential is not null)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credential == UseOwnCredential ? secret : credential);
            using var response = await host.Client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            return (response.StatusCode, string.IsNullOrEmpty(text) ? default : JsonDocument.Parse(text).RootElement.Clone());
        }

        public async ValueTask DisposeAsync()
        {
            console?.Dispose();
            await host.DisposeAsync();
            await world.DisposeAsync();
        }
    }
}
