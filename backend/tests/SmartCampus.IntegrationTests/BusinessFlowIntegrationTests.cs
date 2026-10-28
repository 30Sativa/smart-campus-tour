using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Integrations.Invitations;
using static SmartCampus.IntegrationTests.RepresentativeEndpointTests;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// Exercises the implemented map/POI/route APIs over HTTP against an isolated SQL database.
/// Recorded deployment and route evidence are deliberately simulated backend-test inputs,
/// not evidence of a real robot run.
/// </summary>
public sealed class BusinessFlowIntegrationTests
{
    private const string Password = "integration-test-password";

    [SchemaV14Fact]
    public async Task VersionedMapPoiRouteChain_RecordsSimulatedEvidence_AndStopsAtSchedulingDependency()
    {
        await using var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
        await database.InsertUserAsync(true, username: "flow.admin", roles: ["ADMIN"]);
        var robotId = Guid.NewGuid();
        await database.ExecuteAsync($"""
            INSERT dbo.Robots(Id, RobotCode, SourceType, CredentialHash, IsDispatchEnabled, NeedsInspection, CreatedAt)
            VALUES ('{robotId:D}', N'flow_physical', 'PHYSICAL', 0x02, 1, 0, SYSDATETIMEOFFSET());
            """);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString);

        var adminToken = await Login(host.Client, "flow.admin");
        var technicalId = await CreateAccount(host.Client, adminToken, "flow.technical", "TechnicalStaff");
        var staffId = await CreateAccount(host.Client, adminToken, "flow.staff", "Staff");
        Assert.Equal("TECHNICAL_STAFF", await database.GetOnlyRoleAsync(technicalId));
        Assert.Equal("STAFF", await database.GetOnlyRoleAsync(staffId));
        var technicalToken = await Login(host.Client, "flow.technical");
        var staffToken = await Login(host.Client, "flow.staff");

        // Map upload and manual deployment-check entry are HTTP API operations. This test's
        // deployment evidence is simulated; uploading a package itself does not deploy it.
        using var uploadContent = new MultipartFormDataContent();
        uploadContent.Add(new StringContent("flow-area"), "areaKey");
        uploadContent.Add(new StringContent("Flow Test Area"), "areaName");
        uploadContent.Add(new StringContent(Guid.NewGuid().ToString()), "requestId");
        var package = CreateMapPackage();
        var packageContent = new ByteArrayContent(package);
        packageContent.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        uploadContent.Add(packageContent, "package", "flow-map.zip");
        using var mapUpload = await Send(host.Client, HttpMethod.Post, "/api/technical/map-versions", technicalToken, uploadContent);
        Assert.Equal(HttpStatusCode.OK, mapUpload.StatusCode);
        var map = (await Body(mapUpload)).GetProperty("data");
        var mapId = map.GetProperty("id").GetGuid();
        Assert.Equal("VALID", map.GetProperty("validationStatus").GetString());
        var mapHash = map.GetProperty("packageSha256").GetString();

        using var deployment = await Json(host.Client, HttpMethod.Post, $"/api/technical/map-versions/{mapId}/deployment-checks", technicalToken,
            new { requestId = Guid.NewGuid(), robotCode = "flow_physical", packageSha256 = mapHash,
                localizationPassed = true, displayPassed = true,
                evidenceNote = "SIMULATED BACKEND TEST evidence; not a physical robot result." });
        Assert.Equal(HttpStatusCode.OK, deployment.StatusCode);
        Assert.True((await Body(deployment)).GetProperty("data").GetProperty("passed").GetBoolean());

        using var createPoi = await Json(host.Client, HttpMethod.Post, "/api/staff/poi-proposals", staffToken,
            new { requestId = Guid.NewGuid(), draft = new { mapVersionId = mapId, name = "Library", purpose = "Entrance",
                description = "Integration test", x = 0.5m, y = 0.5m, yaw = 0m, cameraPreset = "FRONT" } });
        Assert.Equal(HttpStatusCode.OK, createPoi.StatusCode);
        var proposal = (await Body(createPoi)).GetProperty("data");
        var proposalId = proposal.GetProperty("id").GetGuid();
        var rowVersion = proposal.GetProperty("rowVersion").GetString()!;
        var poiRevision = proposal.GetProperty("revision");
        var poiRevisionId = poiRevision.GetProperty("id").GetGuid();
        Assert.Equal(mapId, poiRevision.GetProperty("mapVersionId").GetGuid());
        Assert.Equal("NOT_CHECKED", poiRevision.GetProperty("navigationStatus").GetString());

        using var submitPoi = await Json(host.Client, HttpMethod.Post, $"/api/staff/poi-proposals/{proposalId}/submit", staffToken,
            new { requestId = Guid.NewGuid(), expectedRevisionNumber = 1, expectedRowVersion = rowVersion });
        Assert.Equal(HttpStatusCode.OK, submitPoi.StatusCode);
        Assert.Equal("NOT_CHECKED", (await Body(submitPoi)).GetProperty("data").GetProperty("revision").GetProperty("navigationStatus").GetString());

        using var verifyPoi = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/poi-proposals/{proposalId}/revisions/1/verification", technicalToken,
            new { requestId = Guid.NewGuid(), expectedRevisionNumber = 1, expectedRowVersion = rowVersion,
                robotCode = "flow_physical", resultCode = "PASS", reached = true, stopped = true,
                localizationPassed = true, cameraPresetConfirmed = true, reason = (string?)null,
                evidenceNote = "SIMULATED BACKEND TEST evidence; no physical robot test was run." });
        Assert.Equal(HttpStatusCode.OK, verifyPoi.StatusCode);
        var poiVerification = (await Body(verifyPoi)).GetProperty("data");
        Assert.Equal(poiRevisionId, poiVerification.GetProperty("proposalRevisionId").GetGuid());
        Assert.Equal("PASS", poiVerification.GetProperty("resultCode").GetString());

        var routeDraft = new { requestId = Guid.NewGuid(), expectedCurrentRevision = 0, name = "Flow Route",
            description = "API integration test", mapVersionId = mapId, startX = 0.5m, startY = 0.5m, startYaw = 0m,
            endMode = "LAST_POI", endX = (decimal?)null, endY = (decimal?)null, endYaw = (decimal?)null,
            stops = new[] { new { poiRevisionId, dwellSeconds = 10, headSteps = new[] { new { preset = "FRONT", holdSeconds = 5 } } } } };
        using var createRoute = await Json(host.Client, HttpMethod.Post, "/api/staff/routes", staffToken, routeDraft);
        Assert.Equal(HttpStatusCode.OK, createRoute.StatusCode);
        var route = (await Body(createRoute)).GetProperty("data");
        var routeId = route.GetProperty("routeId").GetGuid();
        var routeRevisionId = route.GetProperty("revisionId").GetGuid();
        Assert.Equal(mapId, route.GetProperty("mapVersionId").GetGuid());
        Assert.Equal(poiRevisionId, route.GetProperty("stops")[0].GetProperty("poiRevisionId").GetGuid());
        Assert.Equal("NOT_TESTED", route.GetProperty("verificationStatus").GetString());

        using var submitRoute = await Json(host.Client, HttpMethod.Post,
            $"/api/staff/routes/{routeId}/revisions/{routeRevisionId}/submit", staffToken,
            new { requestId = Guid.NewGuid(), expectedCurrentRevision = 1 });
        Assert.Equal(HttpStatusCode.OK, submitRoute.StatusCode);

        using var routeRun = await Json(host.Client, HttpMethod.Post,
            $"/api/technical/routes/{routeId}/revisions/{routeRevisionId}/test-runs", technicalToken,
            new { requestId = Guid.NewGuid(), robotCode = "flow_physical", participatingStaffUserId = staffId,
                resultCode = "PASS", allStopsReached = true, safelyStopped = true, localizationPassed = true,
                measuredDurationSeconds = 40, failureReason = (string?)null,
                evidenceNote = "SIMULATED BACKEND TEST evidence; this is not a physical robot run." });
        Assert.Equal(HttpStatusCode.OK, routeRun.StatusCode);
        var passingRun = (await Body(routeRun)).GetProperty("data");
        Assert.Equal(routeRevisionId, passingRun.GetProperty("revisionId").GetGuid());
        Assert.Equal("PASS", passingRun.GetProperty("verificationStatus").GetString());
        Assert.NotEqual(Guid.Empty, passingRun.GetProperty("effectiveTestRunId").GetGuid());

        // A changed navigation revision must not inherit the prior route test result.
        var secondDraft = new { requestId = Guid.NewGuid(), expectedCurrentRevision = 1, routeDraft.name, routeDraft.description,
            routeDraft.mapVersionId, startX = 1.5m, routeDraft.startY, routeDraft.startYaw, routeDraft.endMode,
            routeDraft.endX, routeDraft.endY, routeDraft.endYaw, routeDraft.stops };
        using var reviseRoute = await Json(host.Client, HttpMethod.Post, $"/api/staff/routes/{routeId}/revisions", staffToken, secondDraft);
        Assert.Equal(HttpStatusCode.OK, reviseRoute.StatusCode);
        var newRouteRevision = (await Body(reviseRoute)).GetProperty("data");
        Assert.Equal(2, newRouteRevision.GetProperty("revisionNumber").GetInt32());
        Assert.Equal("NOT_TESTED", newRouteRevision.GetProperty("verificationStatus").GetString());
        using var routeHistory = await Get(host.Client, $"/api/routes/{routeId}/revisions", staffToken);
        Assert.Equal(HttpStatusCode.OK, routeHistory.StatusCode);
        var history = (await Body(routeHistory)).GetProperty("data").GetProperty("revisionHistory");
        var priorRevision = Assert.Single(history.EnumerateArray(), item => item.GetProperty("revisionId").GetGuid() == routeRevisionId);
        Assert.Equal("PASS", priorRevision.GetProperty("verificationStatus").GetString());

        // Scheduling has no integration from versioned route/revision to the legacy Tour model.
        // Confirm the legacy aliases fail closed and don't persist a Tour or reservation.
        var beforeTours = await database.CountRowsAsync("dbo.Tours");
        var beforeEvents = await database.CountRowsAsync("dbo.TourEvents");
        using var schedule = await Json(host.Client, HttpMethod.Post, "/api/staff/manage/tours", staffToken,
            new { requestId = Guid.NewGuid(), expectedRouteVersion = new string('0', 64), configuration = new
                { name = "Must not schedule", description = (string?)null, routeId,
                    scheduledStartAt = DateTimeOffset.FromUnixTimeMilliseconds(DateTimeOffset.UtcNow.AddDays(2).ToUnixTimeMilliseconds()),
                    fallbackVideoUrl = (string?)null } });
        Assert.Equal(HttpStatusCode.NotFound, schedule.StatusCode);
        Assert.Equal(beforeTours, await database.CountRowsAsync("dbo.Tours"));
        Assert.Equal(beforeEvents, await database.CountRowsAsync("dbo.TourEvents"));
        // The current schema has no reservation/booking entity or table.
    }

    [SchemaV14Fact]
    public async Task AddingPendingRosterRow_PreservesAcceptedRowsInvitationAndViewerSession()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(
            fixture.Database.ConnectionString, InvitationSettings());
        var representative = await LoginAsync(host.Client, "rep.one");
        var staff = await LoginAsync(host.Client, "review.staff");
        fixture.Bind(host.Client, representative);

        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var submitted = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations",
            Input(tour, "Stable accepted row", "accepted@example.test"), Guid.NewGuid());
        Assert.Equal(HttpStatusCode.OK, submitted.Status);
        var registrationId = submitted.Data.GetProperty("id").GetGuid();

        var detail = (await fixture.SendAsync(HttpMethod.Get,
            $"/api/staff/manage/registrations/{registrationId}", token: staff)).Data;
        var acceptedRow = detail.GetProperty("roster")[0];
        var acceptedRowId = acceptedRow.GetProperty("id").GetGuid();
        var accepted = await fixture.SendAsync(HttpMethod.Post,
            $"/api/staff/manage/registrations/{registrationId}/rows/{acceptedRowId}/accept", new
            {
                requestId = Guid.NewGuid(), expectedRegistrationRowVersion = Version(detail),
                expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
                expectedRowVersion = Version(acceptedRow)
            }, token: staff);
        Assert.Equal(HttpStatusCode.OK, accepted.Status);

        var invitations = (await fixture.SendAsync(HttpMethod.Get,
            $"/api/registrations/{registrationId}/invitations")).Data;
        var invitationId = Assert.Single(invitations.GetProperty("items").EnumerateArray())
            .GetProperty("id").GetGuid();
        var code = await CodeAsync(fixture, invitationId);
        var joined = await StudentAccess(host.Client, fixture.TourId, "join", code);
        Assert.Equal(HttpStatusCode.OK, joined.Status);
        var cookie = CookieHeader(joined.Cookie!);
        Assert.Equal(HttpStatusCode.OK,
            (await StudentAccess(host.Client, fixture.TourId, "session", cookie: cookie)).Status);

        var ownerDetails = await fixture.DataAsync($"/registrations/{registrationId}");
        var update = await fixture.SendAsync(HttpMethod.Put, $"/registrations/{registrationId}", new
        {
            input = Input(tour, "Stable accepted row", "accepted@example.test", mixed: true, rowIds: [acceptedRowId]),
            expectedRowVersion = Version(ownerDetails)
        });
        Assert.True(update.Status == HttpStatusCode.OK, update.Body.GetRawText());

        var after = (await fixture.SendAsync(HttpMethod.Get,
            $"/api/staff/manage/registrations/{registrationId}", token: staff)).Data;
        var rows = after.GetProperty("roster").EnumerateArray().ToArray();
        Assert.Equal("ACCEPTED", rows.Single(row => row.GetProperty("id").GetGuid() == acceptedRowId)
            .GetProperty("participationState").GetString());
        Assert.Equal("PENDING", Assert.Single(rows, row => row.GetProperty("id").GetGuid() != acceptedRowId)
            .GetProperty("participationState").GetString());
        var invitationsAfter = (await fixture.SendAsync(HttpMethod.Get,
            $"/api/registrations/{registrationId}/invitations")).Data.GetProperty("items");
        var invitation = Assert.Single(invitationsAfter.EnumerateArray());
        Assert.Equal(invitationId, invitation.GetProperty("id").GetGuid());
        Assert.Equal(JsonValueKind.Null, invitation.GetProperty("revokedAt").ValueKind);
        Assert.Equal(HttpStatusCode.OK,
            (await StudentAccess(host.Client, fixture.TourId, "session", cookie: cookie)).Status);
    }

    private static async Task<Guid> CreateAccount(HttpClient client, string adminToken, string username, string role)
    {
        using var response = await Json(client, HttpMethod.Post, "/api/admin/accounts", adminToken,
            new { username, fullName = username, role, initialPassword = Password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = (await Body(response)).GetProperty("data");
        Assert.Equal(role, data.GetProperty("role").GetString());
        return data.GetProperty("id").GetGuid();
    }

    private static async Task<string> Login(HttpClient client, string username)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password = Password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await Body(response)).GetProperty("accessToken").GetString()!;
    }

    private static async Task<HttpResponseMessage> Json(HttpClient client, HttpMethod method, string path, string token, object body)
    {
        var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string token, HttpContent content)
    {
        var request = new HttpRequestMessage(method, path) { Content = content };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> Get(HttpClient client, string path, string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client.SendAsync(request);
    }

    private static IReadOnlyDictionary<string, string> InvitationSettings() =>
        InvitationPrimitiveTests.ConfigurationValues()
            .ToDictionary(pair => pair.Key.Replace(":", "__"), pair => pair.Value);

    private static async Task<string> CodeAsync(Fixture fixture, Guid invitationId)
    {
        await using var db = fixture.Context();
        var invitation = await db.Invitations.SingleAsync(item => item.Id == invitationId);
        return new InvitationCodeService(InvitationPrimitiveTests.Configuration())
            .Reveal(invitation.Id, invitation.AccessVersion, invitation.AccessCodeProtected);
    }

    private static async Task<(HttpStatusCode Status, string? Cookie)> StudentAccess(
        HttpClient client, Guid tourId, string action, string? code = null, string? cookie = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/student/tours/{tourId}/{action}");
        if (code is not null) request.Content = JsonContent.Create(new { accessCode = code });
        if (cookie is not null) request.Headers.Add("Cookie", cookie);
        using var response = await client.SendAsync(request);
        var setCookie = response.Headers.TryGetValues("Set-Cookie", out var cookies)
            ? string.Join("\n", cookies)
            : null;
        return (response.StatusCode, setCookie);
    }

    private static string CookieHeader(string setCookie) => string.Join("; ",
        setCookie.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(cookie => cookie.Split(';')[0]));

    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.Clone();
    }

    private static byte[] CreateMapPackage()
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var yaml = archive.CreateEntry("pilot.yaml");
            using (var yamlStream = yaml.Open())
                yamlStream.Write(Encoding.UTF8.GetBytes("image: pilot.pgm\nmode: trinary\nresolution: 1\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n"));
            var pgm = archive.CreateEntry("pilot.pgm");
            using var output = pgm.Open();
            output.Write(Encoding.ASCII.GetBytes("P2\n2 2\n255\n255 255 255 255\n"));
        }
        return stream.ToArray();
    }
}
