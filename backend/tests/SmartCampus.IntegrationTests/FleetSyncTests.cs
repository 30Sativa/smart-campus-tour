using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SmartCampus.Api.Common.Responses;
using SmartCampus.Api.Controllers;
using SmartCampus.Api.Hubs;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.FleetSync.Commands.SyncFleetTelemetry;
using SmartCampus.Infrastructure.Authentication;
using SmartCampus.Infrastructure.Integrations.FleetSync;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class FleetSyncTests
{
    private const string RobotCode = "robot_test_01";
    private const string Password = "integration-test-password";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task SharedFixtures_AreValidJsonContractsForDotnetClients()
    {
        var requestText = await File.ReadAllTextAsync(Fixture("sync-request.json"));
        var request = JsonSerializer.Deserialize<FleetSyncRequest>(requestText, Json);
        Assert.NotNull(request);
        Assert.Equal("robot_test_01", request.RobotId);
        Assert.Equal(1, request.Seq);
        Assert.Null(request.Localized);
        Assert.Null(request.MotionReady);

        var responseText = await File.ReadAllTextAsync(Fixture("sync-response-accepted.json"));
        var response = JsonSerializer.Deserialize<BaseResponse<FleetSyncResponse>>(responseText, Json);
        Assert.NotNull(response);
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Empty(response.Data.Commands);
        Assert.False(response.Data.Duplicate);
        var actual = JsonSerializer.SerializeToNode(response, Json);
        var expected = JsonSerializer.Deserialize<JsonNode>(responseText, Json);
        Assert.True(JsonNode.DeepEquals(expected, actual));
    }

    [Fact]
    public async Task OperationsProjection_KeepsSyncPoseExecutionLocalizationAndMotionReadinessSeparate()
    {
        var now = DateTimeOffset.UtcNow;
        var identity = new FleetRobotIdentity(RobotCode, "PHYSICAL", null, false);
        var oldPose = new FleetPose(1, 2, 0, now.AddMinutes(-1));
        var report = new FleetTelemetryReport(RobotCode, Guid.NewGuid(), 1, now, "test-map", "map",
            oldPose, "NAVIGATING", Guid.NewGuid(), null, null, null, null);
        var snapshot = new FleetTelemetrySnapshot(identity, report, now);
        var settings = TestSettings(syncFresh: TimeSpan.FromSeconds(30), poseFresh: TimeSpan.FromSeconds(5));

        var projection = FleetOperationsProjection.Create(snapshot, now, settings);

        Assert.True(projection.SyncFresh);
        Assert.Equal("Live", projection.ConnectionState);
        Assert.False(projection.PoseFresh);
        Assert.Same(oldPose, projection.Pose);
        Assert.Equal("NAVIGATING", projection.ExecutionStatus);
        Assert.Null(projection.Localized);
        Assert.Null(projection.MotionReady);
        Assert.Equal("Navigating", projection.ExecutionState);
        Assert.Null(projection.Assignable);

        var staleSync = FleetOperationsProjection.Create(snapshot, now.AddSeconds(31), settings);
        Assert.False(staleSync.SyncFresh);
        Assert.Equal("Stale", staleSync.ConnectionState);
        Assert.False(staleSync.PoseFresh);
    }

    [Fact]
    public async Task TelemetryStore_PreservesOrderingAndTombstonesWhileAllowingContinuationAfterRestart()
    {
        var store = new InMemoryFleetTelemetryStore();
        var time = DateTimeOffset.UtcNow;
        var first = Snapshot(Guid.NewGuid(), 1, time, time);

        Assert.True((await store.ApplyAsync(first, CancellationToken.None)).Applied);
        var duplicate = await store.ApplyAsync(first with { ReceivedAt = time.AddSeconds(1) }, CancellationToken.None);
        Assert.False(duplicate.Applied);
        Assert.Equal(first.ReceivedAt, duplicate.Current.ReceivedAt);

        await Assert.ThrowsAsync<SmartCampus.Application.Common.Exceptions.ConflictException>(() =>
            store.ApplyAsync(Snapshot(first.Report.StreamId, 1, time, time, batteryPercent: 50), CancellationToken.None));
        await store.ApplyAsync(Snapshot(first.Report.StreamId, 2, time.AddMilliseconds(1), time), CancellationToken.None);
        var outOfOrder = await Assert.ThrowsAsync<SmartCampus.Application.Common.Exceptions.ConflictException>(() =>
            store.ApplyAsync(first, CancellationToken.None));
        Assert.Equal("OUT_OF_ORDER", outOfOrder.Code);

        var restarted = Snapshot(Guid.NewGuid(), 1, time.AddMilliseconds(2), time.AddSeconds(2));
        await store.ApplyAsync(restarted, CancellationToken.None);
        var delayedOldStream = await Assert.ThrowsAsync<SmartCampus.Application.Common.Exceptions.ConflictException>(() =>
            store.ApplyAsync(Snapshot(first.Report.StreamId, 3, time.AddSeconds(3), time.AddSeconds(3)), CancellationToken.None));
        Assert.Equal("STALE_STREAM", delayedOldStream.Code);
        var nonInitialSequence = await Assert.ThrowsAsync<SmartCampus.Application.Common.Exceptions.ConflictException>(() =>
            store.ApplyAsync(Snapshot(Guid.NewGuid(), 2, time.AddSeconds(4), time.AddSeconds(4)), CancellationToken.None));
        Assert.Equal("STREAM_START_REQUIRED", nonInitialSequence.Code);
        await store.ApplyAsync(Snapshot(restarted.Report.StreamId, 2, time.AddSeconds(4), time.AddSeconds(4)), CancellationToken.None);
        var alternatingOwner = await Assert.ThrowsAsync<SmartCampus.Application.Common.Exceptions.ConflictException>(() =>
            store.ApplyAsync(Snapshot(first.Report.StreamId, 4, time.AddSeconds(5), time.AddSeconds(5)), CancellationToken.None));
        Assert.Equal("STALE_STREAM", alternatingOwner.Code);
        Assert.Equal(restarted.Report.StreamId, Assert.Single(store.GetLatest()).Report.StreamId);

        // A backend restart loses the projection and tombstones. A running
        // bridge continues its existing stream at the next sequence.
        var priorProcess = new InMemoryFleetTelemetryStore();
        var continuingStream = Guid.NewGuid();
        await priorProcess.ApplyAsync(Snapshot(continuingStream, 1, time, time), CancellationToken.None);
        await priorProcess.ApplyAsync(Snapshot(continuingStream, 2, time.AddSeconds(1), time), CancellationToken.None);
        await priorProcess.ApplyAsync(Snapshot(continuingStream, 3, time.AddSeconds(2), time), CancellationToken.None);
        var afterBackendRestart = new InMemoryFleetTelemetryStore();
        Assert.Empty(afterBackendRestart.GetLatest());
        Assert.True((await afterBackendRestart.ApplyAsync(
            Snapshot(continuingStream, 4, time.AddSeconds(3), time), CancellationToken.None)).Applied);
        Assert.True((await afterBackendRestart.ApplyAsync(
            Snapshot(continuingStream, 5, time.AddSeconds(4), time), CancellationToken.None)).Applied);
        var duplicateAfterRestart = await afterBackendRestart.ApplyAsync(
            Snapshot(continuingStream, 5, time.AddSeconds(4), time.AddSeconds(5)), CancellationToken.None);
        Assert.False(duplicateAfterRestart.Applied);
        Assert.Equal(time.AddSeconds(4), duplicateAfterRestart.Current.Report.ReportedAt);
        var delayedAfterRestart = await Assert.ThrowsAsync<SmartCampus.Application.Common.Exceptions.ConflictException>(() =>
            afterBackendRestart.ApplyAsync(
                Snapshot(continuingStream, 4, time.AddSeconds(3), time.AddSeconds(6)), CancellationToken.None));
        Assert.Equal("OUT_OF_ORDER", delayedAfterRestart.Code);
    }

    [Fact]
    public async Task TelemetryStore_AllowsAnySequenceWhenEmptyButRequiresSequenceOneForNewOwner()
    {
        var store = new InMemoryFleetTelemetryStore();
        var now = DateTimeOffset.UtcNow;
        var firstObserved = await store.ApplyAsync(Snapshot(Guid.NewGuid(), 4, now, now), CancellationToken.None);
        Assert.True(firstObserved.Applied);

        var nonInitialOwner = await Assert.ThrowsAsync<SmartCampus.Application.Common.Exceptions.ConflictException>(() =>
            store.ApplyAsync(Snapshot(Guid.NewGuid(), 2, now.AddMilliseconds(1), now), CancellationToken.None));
        Assert.Equal("STREAM_START_REQUIRED", nonInitialOwner.Code);

        var steppedBack = await Assert.ThrowsAsync<SmartCampus.Application.Common.Exceptions.ConflictException>(() =>
            store.ApplyAsync(Snapshot(firstObserved.Current.Report.StreamId, 5, now.AddMilliseconds(-1), now), CancellationToken.None));
        Assert.Equal("OUT_OF_ORDER", steppedBack.Code);
    }

    [Fact]
    public async Task AcceptedSyncSurvivesConfirmationWriteFailureAndRetriesOnNextNewReport()
    {
        var now = DateTimeOffset.UtcNow;
        var identity = new FleetRobotIdentity(RobotCode, "PHYSICAL", null, false);
        var store = new InMemoryFleetTelemetryStore();
        var confirmation = new FailingOnceConfirmationStore();
        var settings = new FleetSyncSettings(
            new Dictionary<string, FleetRobotMapContext> { [RobotCode] = new("test-map", "map") },
            TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(30),
            TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
        var handler = new SyncFleetTelemetryHandler(store, confirmation, settings,
            new FixedTimeProvider(now), Microsoft.Extensions.Logging.Abstractions.NullLogger<SyncFleetTelemetryHandler>.Instance);
        var first = new FleetTelemetryReport(RobotCode, Guid.NewGuid(), 1, now, "test-map", "map",
            null, "IDLE", null, null, null, null, null);

        var accepted = await handler.Handle(new SyncFleetTelemetry(identity, first, new byte[32]), CancellationToken.None);
        Assert.False(accepted.Duplicate);
        Assert.Equal(1, confirmation.Attempts);

        var second = first with { Seq = 2, ReportedAt = now.AddMilliseconds(1) };
        var retried = await handler.Handle(new SyncFleetTelemetry(identity, second, new byte[32]), CancellationToken.None);
        Assert.False(retried.Duplicate);
        Assert.Equal(2, confirmation.Attempts);
        Assert.Equal(("test-map", "map", now), confirmation.Saved);

        var third = second with { Seq = 3, ReportedAt = now.AddMilliseconds(2) };
        var alreadyConfirmed = await handler.Handle(
            new SyncFleetTelemetry(identity, third, new byte[32], IsConnectionConfirmedForCredential: true), CancellationToken.None);
        Assert.False(alreadyConfirmed.Duplicate);
        Assert.Equal(2, confirmation.Attempts);
    }

    [Fact]
    public async Task TelemetryStore_RejectsAStreamWhileItRemainsInTheSixteenEntryTombstoneHistory()
    {
        var store = new InMemoryFleetTelemetryStore();
        var now = DateTimeOffset.UtcNow;
        var firstStream = Guid.NewGuid();
        await store.ApplyAsync(Snapshot(firstStream, 1, now, now), CancellationToken.None);

        for (var rotation = 1; rotation <= 16; rotation++)
        {
            var current = Guid.NewGuid();
            await store.ApplyAsync(Snapshot(current, 1, now.AddSeconds(rotation), now), CancellationToken.None);
        }

        var reclaimed = await Assert.ThrowsAsync<SmartCampus.Application.Common.Exceptions.ConflictException>(() =>
            store.ApplyAsync(Snapshot(firstStream, 1, now.AddSeconds(17), now), CancellationToken.None));

        Assert.Equal("STALE_STREAM", reclaimed.Code);
    }

    [Fact]
    public async Task TelemetryStore_ConcurrentReportsNeverLeaveAnOlderSequenceAsLatest()
    {
        var stream = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var beforeRestart = new InMemoryFleetTelemetryStore();
        await beforeRestart.ApplyAsync(Snapshot(stream, 1, now, now), CancellationToken.None);
        await beforeRestart.ApplyAsync(Snapshot(stream, 2, now.AddMilliseconds(1), now), CancellationToken.None);
        await beforeRestart.ApplyAsync(Snapshot(stream, 3, now.AddMilliseconds(2), now), CancellationToken.None);
        var restartedStore = new InMemoryFleetTelemetryStore();
        var lower = Snapshot(stream, 4, now.AddMilliseconds(3), now);
        var higher = Snapshot(stream, 5, now.AddMilliseconds(4), now.AddMilliseconds(1));

        var results = await Task.WhenAll(
            ApplyOrConflictAsync(restartedStore, lower),
            ApplyOrConflictAsync(restartedStore, higher));

        Assert.Contains(true, results);
        Assert.Equal(5, Assert.Single(restartedStore.GetLatest()).Report.Seq);
    }

    [Fact]
    public async Task TelemetryStore_ConcurrentExactRetriesApplyOnceAndRemainIdempotent()
    {
        var store = new InMemoryFleetTelemetryStore();
        var now = DateTimeOffset.UtcNow;
        var report = Snapshot(Guid.NewGuid(), 1, now, now);

        var results = await Task.WhenAll(
            store.ApplyAsync(report, CancellationToken.None),
            store.ApplyAsync(report, CancellationToken.None));

        Assert.Single(results, result => result.Applied);
        Assert.Single(results, result => !result.Applied);
        Assert.Single(store.GetLatest());
    }

    [Fact]
    public void FleetCredential_IsRandomHighEntropyHashedAndCompared()
    {
        var first = FleetRobotCredentialHash.Create();
        var second = FleetRobotCredentialHash.Create();

        Assert.Equal(43, first.Secret.Length);
        Assert.Equal(32, first.Hash.Length);
        Assert.True(FleetRobotCredentialHash.Verify(first.Secret, first.Hash));
        Assert.False(FleetRobotCredentialHash.Verify("invalid", first.Hash));
        Assert.False(FleetRobotCredentialHash.Verify(first.Secret, second.Hash));
        Assert.NotEqual(Encoding.ASCII.GetBytes(first.Secret), first.Hash);
        Assert.NotEqual(first.Secret, second.Secret);
    }

    [Fact]
    public async Task MalformedFleetCredential_IsRejectedBeforeOpeningSqlConnection()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlServer("Server=127.0.0.1,1;Database=never_opened;Integrated Security=true;Connect Timeout=1;TrustServerCertificate=true")
            .Options;
        await using var context = new ApplicationDbContext(options);
        var authenticator = new FleetRobotAuthenticator(context);

        var identity = await authenticator.AuthenticateAsync(RobotCode, "x", CancellationToken.None);

        Assert.Null(identity);
    }

    [SchemaV11Fact]
    public async Task SyncEndpoint_AppliesPerIpRateLimitBeforeRobotAuthentication()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var settings = new Dictionary<string, string>
        {
            ["FleetSync:RateLimit:PermitLimit"] = "2",
            ["FleetSync:RateLimit:WindowSeconds"] = "60"
        };
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString, settings);

        using var first = await host.Client.SendAsync(CreateSyncRequest(ValidRequest(), "x"));
        using var second = await host.Client.SendAsync(CreateSyncRequest(ValidRequest(), "x"));
        using var limited = await host.Client.SendAsync(CreateSyncRequest(ValidRequest(), "x"));

        Assert.Equal(HttpStatusCode.Unauthorized, first.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal("RATE_LIMITED", await ErrorCodeAsync(limited));
    }

    [SchemaV11Fact]
    public async Task SyncEndpoint_AuthenticatesRobotAndReconcilesWithoutTelemetryWrites()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var robot = FleetRobotCredentialHash.Create();
        await using (var context = CreateContext(database.ConnectionString))
        {
            context.Robots.Add(new SmartCampus.Domain.Entities.Robot
            {
                Id = Guid.NewGuid(), RobotCode = RobotCode, SourceType = "PHYSICAL", DisplayName = "Test robot",
                CredentialHash = robot.Hash, IsDispatchEnabled = false, NeedsInspection = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await context.SaveChangesAsync();
        }
        await database.InsertUserAsync(true, username: "fleet.staff", roles: ["STAFF"]);
        var settings = RobotContextSettings();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString, settings);

        using (var noCredential = CreateSyncRequest(ValidRequest()))
        using (var response = await host.Client.SendAsync(noCredential))
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        using (var wrongCredential = CreateSyncRequest(ValidRequest(), "wrong-secret"))
        using (var response = await host.Client.SendAsync(wrongCredential))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain("wrong-secret", body, StringComparison.Ordinal);
            Assert.DoesNotContain(robot.Secret, body, StringComparison.Ordinal);
        }

        var userToken = await GetAccessTokenAsync(host.Client, "fleet.staff");
        using (var userCredential = CreateSyncRequest(ValidRequest(), userToken))
        using (var response = await host.Client.SendAsync(userCredential))
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        using (var malformed = new HttpRequestMessage(HttpMethod.Post, "/api/fleet/v1/sync"))
        {
            malformed.Headers.Authorization = new AuthenticationHeaderValue("Bearer", robot.Secret);
            malformed.Headers.Add("X-Robot-Code", RobotCode);
            malformed.Content = new StringContent("{not-json", Encoding.UTF8, "application/json");
            using var response = await host.Client.SendAsync(malformed);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.DoesNotContain(robot.Secret, await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }

        using (var mismatchedIdentity = CreateSyncRequest(ValidRequest() with { RobotId = "robot_other" }, robot.Secret))
        using (var response = await host.Client.SendAsync(mismatchedIdentity))
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        await using (var beforeAccepted = CreateContext(database.ConnectionString))
        {
            var stillUnconfirmed = await beforeAccepted.Robots.AsNoTracking().SingleAsync();
            Assert.Null(stillUnconfirmed.FirstAcceptedSyncAt);
            Assert.Null(stillUnconfirmed.FirstAcceptedMapKey);
            Assert.Null(stillUnconfirmed.FirstAcceptedFrameId);
        }

        var request = ValidRequest();
        using (var acceptedRequest = CreateSyncRequest(request, robot.Secret))
        using (var accepted = await host.Client.SendAsync(acceptedRequest))
        {
            Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
            using var body = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync());
            var data = body.RootElement.GetProperty("data");
            Assert.True(data.GetProperty("accepted").GetBoolean());
            Assert.False(data.GetProperty("duplicate").GetBoolean());
            Assert.Empty(data.GetProperty("commands").EnumerateArray());
        }

        using (var duplicateRequest = CreateSyncRequest(request, robot.Secret))
        using (var duplicate = await host.Client.SendAsync(duplicateRequest))
        {
            Assert.Equal(HttpStatusCode.OK, duplicate.StatusCode);
            using var body = JsonDocument.Parse(await duplicate.Content.ReadAsStringAsync());
            Assert.True(body.RootElement.GetProperty("data").GetProperty("duplicate").GetBoolean());
        }

        using (var reusedSequence = CreateSyncRequest(request with { BatteryPercent = 42 }, robot.Secret))
        using (var response = await host.Client.SendAsync(reusedSequence))
        {
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Equal("SEQUENCE_REUSED", await ErrorCodeAsync(response));
        }

        var seq2 = request with
        {
            Seq = 2,
            ReportedAt = DateTimeOffset.UtcNow.AddMilliseconds(-1),
            Pose = null
        };
        using (var nextRequest = CreateSyncRequest(seq2, robot.Secret))
        using (var response = await host.Client.SendAsync(nextRequest))
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using (var oldSequence = CreateSyncRequest(request, robot.Secret))
        using (var response = await host.Client.SendAsync(oldSequence))
        {
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Equal("OUT_OF_ORDER", await ErrorCodeAsync(response));
        }

        using (var wrongContext = CreateSyncRequest(seq2 with { Seq = 3, MapKey = "unapproved-map" }, robot.Secret))
        using (var response = await host.Client.SendAsync(wrongContext))
        {
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Equal("MAP_CONTEXT_MISMATCH", await ErrorCodeAsync(response));
        }

        using (var staleReport = CreateSyncRequest(seq2 with { Seq = 3, ReportedAt = DateTimeOffset.UtcNow.AddDays(-1) }, robot.Secret))
        using (var response = await host.Client.SendAsync(staleReport))
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        await using var verify = CreateContext(database.ConnectionString);
        var storedRobot = await verify.Robots.AsNoTracking().SingleAsync();
        Assert.Equal(robot.Hash, storedRobot.CredentialHash);
        Assert.NotNull(storedRobot.FirstAcceptedSyncAt);
        Assert.Equal("test-campus-map-v1", storedRobot.FirstAcceptedMapKey);
        Assert.Equal("map", storedRobot.FirstAcceptedFrameId);
        Assert.InRange(storedRobot.FirstAcceptedSyncAt!.Value, request.ReportedAt.AddSeconds(-1), request.ReportedAt.AddSeconds(1));
        Assert.False(storedRobot.IsDispatchEnabled);
        Assert.True(storedRobot.NeedsInspection);
        Assert.Equal(0, await database.CountRowsAsync("dbo.TourEvents"));
        Assert.Equal(0, await database.CountRowsAsync("dbo.MapDeploymentChecks"));

        // Duplicate, stale, wrong-context, and rejected reports do not replace the first accepted evidence.
        Assert.InRange(storedRobot.FirstAcceptedSyncAt!.Value, request.ReportedAt.AddSeconds(-1), request.ReportedAt.AddSeconds(1));
        Assert.Equal("test-campus-map-v1", storedRobot.FirstAcceptedMapKey);
        Assert.Equal("map", storedRobot.FirstAcceptedFrameId);
    }

    [SchemaV17Fact]
    public async Task ConnectionConfirmation_IsWriteOnceConcurrentAndBoundToCurrentCredentialHash()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var actor = await database.InsertUserAsync(true, username: "confirmation.rotate.actor", roles: ["ADMIN"]);
        var credential = FleetRobotCredentialHash.Create();
        var robotId = Guid.NewGuid();
        await using (var context = CreateContext(database.ConnectionString))
        {
            context.Robots.Add(new SmartCampus.Domain.Entities.Robot
            {
                Id = robotId, RobotCode = "confirmation_race", SourceType = "PHYSICAL", DisplayName = "Race",
                CredentialHash = credential.Hash, IsDispatchEnabled = false, NeedsInspection = false,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await context.SaveChangesAsync();
        }

        async Task<bool> RecordAsync(string mapKey, string frameId, DateTimeOffset acceptedAt)
        {
            await using var context = CreateContext(database.ConnectionString);
            var store = new EfFleetRobotConnectionConfirmationStore(context);
            return await store.TryRecordFirstAcceptedAsync("confirmation_race", credential.Hash,
                mapKey, frameId, acceptedAt, CancellationToken.None);
        }

        var acceptedTimes = new[] { DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddSeconds(1) };
        var results = await Task.WhenAll(
            RecordAsync("map-a", "frame-a", acceptedTimes[0]),
            RecordAsync("map-b", "frame-b", acceptedTimes[1]));
        Assert.Equal(1, results.Count(result => result));
        Assert.Equal(1, results.Count(result => !result));

        byte[] oldHash;
        string currentCredential;
        await using (var context = CreateContext(database.ConnectionString))
        {
            var robot = await context.Robots.AsNoTracking().SingleAsync(item => item.Id == robotId);
            oldHash = robot.CredentialHash!;
            Assert.True(
                robot.FirstAcceptedMapKey == "map-a" && robot.FirstAcceptedFrameId == "frame-a" ||
                robot.FirstAcceptedMapKey == "map-b" && robot.FirstAcceptedFrameId == "frame-b");
            var rotated = await new EfPhysicalRobotCredentialManager(context, TimeProvider.System)
                .ChangeAsync(robot.RobotCode, RobotCredentialOperation.Rotate, Guid.NewGuid(), actor.Id,
                    "WEB", Convert.ToBase64String(robot.RowVersion), reason: null, CancellationToken.None);
            currentCredential = rotated.Secret!;
        }

        await using (var context = CreateContext(database.ConnectionString))
        {
            var current = await context.Robots.AsNoTracking().SingleAsync(item => item.Id == robotId);
            Assert.Null(current.FirstAcceptedSyncAt);
            Assert.Null(current.FirstAcceptedMapKey);
            Assert.Null(current.FirstAcceptedFrameId);
            var store = new EfFleetRobotConnectionConfirmationStore(context);
            Assert.False(await store.TryRecordFirstAcceptedAsync(current.RobotCode, oldHash,
                "stale-map", "stale-frame", DateTimeOffset.UtcNow, CancellationToken.None));
            var proof = await new FleetRobotAuthenticator(context).AuthenticateAsync(current.RobotCode,
                currentCredential, CancellationToken.None);
            Assert.NotNull(proof);
            Assert.True(await store.TryRecordFirstAcceptedAsync(current.RobotCode, proof!.VerifiedCredentialHash,
                "current-map", "current-frame", DateTimeOffset.UtcNow, CancellationToken.None));
        }
    }

    [SchemaV11Fact]
    public async Task SyncEndpoint_ContinuesStreamAfterApiRestartAndSafelyRetriesRejectedOrUnconfirmedReports()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        var robot = FleetRobotCredentialHash.Create();
        await using (var context = CreateContext(database.ConnectionString))
        {
            context.Robots.Add(new SmartCampus.Domain.Entities.Robot
            {
                Id = Guid.NewGuid(), RobotCode = RobotCode, SourceType = "PHYSICAL", DisplayName = "Test robot",
                CredentialHash = robot.Hash, IsDispatchEnabled = false, NeedsInspection = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await context.SaveChangesAsync();
        }

        var streamId = Guid.NewGuid();
        var settings = RobotContextSettings();
        var nextReportAt = DateTimeOffset.UtcNow.AddMilliseconds(-50);

        FleetSyncRequest Request(long seq, DateTimeOffset? reportedAt = null)
        {
            var latestCandidate = DateTimeOffset.UtcNow.AddMilliseconds(-50);
            var timestamp = reportedAt ?? (nextReportAt = latestCandidate > nextReportAt
                ? latestCandidate
                : nextReportAt.AddMilliseconds(1));
            var request = ValidRequest() with { StreamId = streamId, Seq = seq, ReportedAt = timestamp };
            return request with { Pose = request.Pose! with { CapturedAt = timestamp } };
        }

        await using (var firstProcess = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(
            database.ConnectionString, settings))
        {
            var invalid = Request(1, DateTimeOffset.UtcNow.AddDays(-1));
            invalid = invalid with { Pose = invalid.Pose! with { CapturedAt = invalid.ReportedAt } };
            using (var rejected = await firstProcess.Client.SendAsync(CreateSyncRequest(invalid, robot.Secret)))
                Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);

            using (var correctedRetry = await firstProcess.Client.SendAsync(CreateSyncRequest(Request(1), robot.Secret)))
            {
                Assert.Equal(HttpStatusCode.OK, correctedRetry.StatusCode);
                using var body = JsonDocument.Parse(await correctedRetry.Content.ReadAsStringAsync());
                Assert.False(body.RootElement.GetProperty("data").GetProperty("duplicate").GetBoolean());
            }

            foreach (var seq in new long[] { 2, 3 })
            {
                using var response = await firstProcess.Client.SendAsync(CreateSyncRequest(Request(seq), robot.Secret));
                Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            }
        }

        await using (var restartedProcess = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(
            database.ConnectionString, settings))
        {
            // The caller loses the first response after the API has applied seq 4.
            // An exact retry must be acknowledged as a duplicate.
            var seq4 = Request(4);
            using (await restartedProcess.Client.SendAsync(CreateSyncRequest(seq4, robot.Secret))) { }
            using (var retry = await restartedProcess.Client.SendAsync(CreateSyncRequest(seq4, robot.Secret)))
            {
                Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
                using var body = JsonDocument.Parse(await retry.Content.ReadAsStringAsync());
                Assert.True(body.RootElement.GetProperty("data").GetProperty("duplicate").GetBoolean());
            }

            var seq5 = Request(5);
            using (var accepted = await restartedProcess.Client.SendAsync(CreateSyncRequest(seq5, robot.Secret)))
            {
                Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
                using var body = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync());
                Assert.False(body.RootElement.GetProperty("data").GetProperty("duplicate").GetBoolean());
            }

            using (var delayedSeq4 = await restartedProcess.Client.SendAsync(CreateSyncRequest(seq4, robot.Secret)))
            {
                Assert.Equal(HttpStatusCode.Conflict, delayedSeq4.StatusCode);
                Assert.Equal("OUT_OF_ORDER", await ErrorCodeAsync(delayedSeq4));
            }
        }
    }

    [SchemaV11Fact]
    public async Task OperationsHub_RequiresStaffJwtAndRejectsRobotCredential()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "operations.staff", roles: ["STAFF"]);
        await database.InsertUserAsync(true, username: "operations.rep", roles: ["SCHOOL_REPRESENTATIVE"]);
        var robot = FleetRobotCredentialHash.Create();
        await using (var context = CreateContext(database.ConnectionString))
        {
            context.Robots.Add(new SmartCampus.Domain.Entities.Robot
            {
                Id = Guid.NewGuid(), RobotCode = RobotCode, SourceType = "EMULATOR",
                CredentialHash = robot.Hash, IsDispatchEnabled = false, NeedsInspection = false,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await context.SaveChangesAsync();
        }
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);

        using (var anonymous = await PostNegotiateAsync(host.Client, token: null))
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        var representative = await GetAccessTokenAsync(host.Client, "operations.rep");
        using (var wrongRole = await PostNegotiateAsync(host.Client, representative))
            Assert.Equal(HttpStatusCode.Forbidden, wrongRole.StatusCode);
        using (var machine = await PostNegotiateAsync(host.Client, robot.Secret))
            Assert.Equal(HttpStatusCode.Unauthorized, machine.StatusCode);
        var staff = await GetAccessTokenAsync(host.Client, "operations.staff");
        using (var authorized = await PostNegotiateAsync(host.Client, staff))
            Assert.Equal(HttpStatusCode.OK, authorized.StatusCode);
    }

    [SchemaV11Fact]
    public async Task OperationsHub_ClosesStaffWebSocketWhenJwtExpires()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "operations.expiry", roles: ["STAFF"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);
        var staffToken = IssueShortLivedStaffToken(TimeSpan.FromSeconds(8));

        using var negotiate = await PostNegotiateAsync(host.Client, staffToken);
        Assert.Equal(HttpStatusCode.OK, negotiate.StatusCode);
        using var negotiateBody = JsonDocument.Parse(await negotiate.Content.ReadAsStringAsync());
        var connectionToken = negotiateBody.RootElement.GetProperty("connectionToken").GetString();
        Assert.False(string.IsNullOrWhiteSpace(connectionToken));

        var baseAddress = host.Client.BaseAddress!;
        var socketUri = new UriBuilder(baseAddress)
        {
            Scheme = "ws",
            Path = "/hubs/operations",
            Query = $"id={Uri.EscapeDataString(connectionToken!)}&access_token={Uri.EscapeDataString(staffToken)}"
        }.Uri;
        using var socket = new ClientWebSocket();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        await socket.ConnectAsync(socketUri, timeout.Token);
        await socket.SendAsync(
            Encoding.UTF8.GetBytes("{\"protocol\":\"json\",\"version\":1}\u001e"),
            WebSocketMessageType.Text,
            endOfMessage: true,
            timeout.Token);

        var buffer = new byte[4096];
        var closedByExpiry = false;
        while (!timeout.IsCancellationRequested)
        {
            var received = await socket.ReceiveAsync(buffer.AsMemory(), timeout.Token);
            if (received.MessageType == WebSocketMessageType.Close)
            {
                closedByExpiry = true;
                break;
            }
        }

        Assert.True(closedByExpiry, "The Staff Hub connection remained open after its JWT expired.");
    }

    private static FleetSyncRequest ValidRequest()
    {
        var fixture = JsonSerializer.Deserialize<FleetSyncRequest>(
            File.ReadAllText(Fixture("sync-request.json")), Json)!;
        var now = DateTimeOffset.UtcNow.AddMilliseconds(-10);
        return fixture with
        {
            RobotId = RobotCode,
            ReportedAt = now,
            Pose = fixture.Pose! with { CapturedAt = now }
        };
    }

    private static HttpRequestMessage CreateSyncRequest(FleetSyncRequest body, string? credential = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/fleet/v1/sync")
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-Robot-Code", RobotCode);
        if (credential is not null)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credential);
        return request;
    }

    private static Task<HttpResponseMessage> PostNegotiateAsync(HttpClient client, string? token)
    {
        var path = "/hubs/operations/negotiate?negotiateVersion=1";
        if (token is not null)
            path += "&access_token=" + Uri.EscapeDataString(token);
        return client.PostAsync(path, content: null);
    }

    private static async Task<string?> ErrorCodeAsync(HttpResponseMessage response)
    {
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return body.RootElement.TryGetProperty("errors", out var errors) &&
               errors.TryGetProperty("code", out var code)
            ? code.GetString()
            : null;
    }

    private static async Task<string> GetAccessTokenAsync(HttpClient client, string username)
    {
        using var login = await client.PostAsJsonAsync("/api/auth/login", new { username, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var body = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        return body.RootElement.GetProperty("accessToken").GetString()!;
    }

    private static string IssueShortLivedStaffToken(TimeSpan lifetime)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: "SmartCampus.Api",
            audience: "SmartCampus.Web",
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, Guid.NewGuid().ToString("D")),
                new Claim("role", "Staff")
            ],
            notBefore: now.AddSeconds(-1),
            expires: now.Add(lifetime),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(InitialAdminSeederTests.TestJwtSigningKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static FleetTelemetrySnapshot Snapshot(
        Guid streamId,
        long seq,
        DateTimeOffset reportedAt,
        DateTimeOffset receivedAt,
        double? batteryPercent = null)
    {
        var robot = new FleetRobotIdentity(RobotCode, "PHYSICAL", "Test robot", false);
        var report = new FleetTelemetryReport(RobotCode, streamId, seq, reportedAt, "test-map", "map",
            null, "IDLE", null, null, null, null, batteryPercent);
        return new FleetTelemetrySnapshot(robot, report, receivedAt);
    }

    private static async Task<bool> ApplyOrConflictAsync(InMemoryFleetTelemetryStore store, FleetTelemetrySnapshot snapshot)
    {
        try
        {
            return (await store.ApplyAsync(snapshot, CancellationToken.None)).Applied;
        }
        catch (SmartCampus.Application.Common.Exceptions.ConflictException)
        {
            return false;
        }
    }

    private static FleetSyncSettings TestSettings(TimeSpan syncFresh, TimeSpan poseFresh) => new(
        new Dictionary<string, FleetRobotMapContext> { [RobotCode] = new("test-map", "map") },
        TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5), syncFresh, poseFresh, TimeSpan.FromSeconds(5));

    private static IReadOnlyDictionary<string, string> RobotContextSettings() => new Dictionary<string, string>
    {
        [$"FleetSync:RobotContexts:{RobotCode}:MapKey"] = "test-campus-map-v1",
        [$"FleetSync:RobotContexts:{RobotCode}:FrameId"] = "map"
    };

    private static string Fixture(string name) => Path.Combine(
        AppContext.BaseDirectory, "ContractFixtures", "fleet-sync", "v1", name);

    private static ApplicationDbContext CreateContext(string connectionString) =>
        new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(connectionString).Options);

    private sealed class FailingOnceConfirmationStore : IFleetRobotConnectionConfirmationStore
    {
        public int Attempts { get; private set; }
        public (string MapKey, string FrameId, DateTimeOffset AcceptedAt)? Saved { get; private set; }

        public Task<bool> TryRecordFirstAcceptedAsync(string robotCode, byte[] verifiedCredentialHash,
            string mapKey, string frameId, DateTimeOffset acceptedAt, CancellationToken cancellationToken)
        {
            Attempts++;
            if (Attempts == 1) throw new InvalidOperationException("Injected confirmation persistence failure.");
            Saved = (mapKey, frameId, acceptedAt);
            return Task.FromResult(true);
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
