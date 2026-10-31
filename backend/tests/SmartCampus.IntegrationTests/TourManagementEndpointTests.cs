using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Application.Features.Tours.Commands.CreateTour;
using SmartCampus.Application.Features.Tours.Commands.UpdateTour;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Integrations.Invitations;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class TourManagementEndpointTests
{
    [SchemaV11Fact]
    public async Task ReadAndFilterLegacyTour_AndRegistrationSeesIt()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var detail = await f.Detail(id);
        Assert.Equal("SCHEDULED", detail.Tour.State);
        Assert.Equal(f.Route.Id, detail.Tour.RouteId);
        Assert.Equal(detail.Tour.RouteId, detail.Tour.ActiveRouteId);
        Assert.Equal(8, Convert.FromBase64String(detail.Tour.RowVersion).Length);
        Assert.False(detail.Route!.Usage.CanEditConfiguration);
        Assert.True(detail.Permissions.CanEditMetadata);
        Assert.False(detail.Permissions.CanDelete);
        var representative = await f.Send(HttpMethod.Get, $"/api/representative/tours/{id}", token: f.Representative);
        Assert.Equal(id, representative.GetProperty("id").GetGuid());
        Assert.Equal(3, representative.GetProperty("stops").GetArrayLength());
        foreach (var query in new[] { "?search=SQL&state=SCHEDULED&size=1", $"?from={Uri.EscapeDataString(f.Input().ScheduledStartAt.AddHours(-1).ToString("O"))}&sort=-createdAt" })
        {
            var list = await f.Send(HttpMethod.Get, "/api/staff/manage/tours" + query);
            Assert.Single(list.EnumerateArray());
        }
        await using var db = f.Context();
        var tour = await db.Tours.SingleAsync();
        Assert.False(tour.HasExecutionState);
        Assert.Null(tour.AssignedRobotId);
        Assert.Null(tour.CurrentStep);
        Assert.Equal(f.AdminId, tour.CreatedByUserId);
        Assert.Equal(TimeSpan.Zero, tour.ScheduledStartAt.Offset);
    }

    [SchemaV11Fact]
    public async Task CreateAndMutationReceipts_SerializeRetriesAndRejectKeyReuse_AfterStateChanges()
    {
        await using var f = await Fixture.Create();
        var request = f.CreateRequest();
        await f.Send(HttpMethod.Post, "/api/staff/manage/tours", request, HttpStatusCode.NotFound);
        await f.Send(HttpMethod.Post, "/api/staff/manage/tours", request, HttpStatusCode.NotFound);
        await f.Send(HttpMethod.Post, "/api/staff/manage/tours", request with { Configuration = request.Configuration with { Name = "Different" } }, HttpStatusCode.NotFound);
        var id = await f.CreateTour();
        var detail = await f.Detail(id);
        var update = new UpdateTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, null, f.Input() with { Name = "Changed" });
        await f.Send(HttpMethod.Put, $"/api/staff/manage/tours/{id}", update);
        await f.Send(HttpMethod.Put, $"/api/staff/manage/tours/{id}", update);
        detail = await f.Detail(id);
        var cancel = new CancelTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, "Cancelled test");
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", cancel);
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", cancel);
        await f.Send(HttpMethod.Post, "/api/staff/manage/tours", request, HttpStatusCode.NotFound);
        Assert.Equal("CANCELLED", (await f.Detail(id)).Tour.State);
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", cancel with { RequestId = request.RequestId }, HttpStatusCode.Conflict);
        await using var db = f.Context();
        Assert.Single(await db.Tours.ToArrayAsync());
        Assert.Equal(2, await db.AuditLogs.CountAsync(a => a.EntityType == "Tour"));
    }

    [SchemaV11Fact]
    public async Task AdminAuthorizationAndPayloadValidation_DoNotCreateOrDeleteTours()
    {
        await using var f = await Fixture.Create();
        foreach (var token in new string?[] { null, f.SystemAdmin, f.Representative })
        {
            var expected = token is null ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden;
            foreach (var method in new[] { HttpMethod.Get, HttpMethod.Post, HttpMethod.Put })
            {
                using var request = new HttpRequestMessage(method, method == HttpMethod.Put ? $"/api/staff/manage/tours/{Guid.NewGuid()}" : "/api/staff/manage/tours");
                if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = JsonContent.Create(f.CreateRequest());
                using var response = await f.Client.SendAsync(request);
                Assert.Equal(expected, response.StatusCode);
            }
        }
        foreach (var input in new[] { f.CreateInput() with { Name = " " }, f.CreateInput() with { ScheduledStartAt = f.Now.AddMinutes(-1) }, f.CreateInput() with { FallbackVideoUrl = "javascript:alert(1)" } })
            await f.Send(HttpMethod.Post, "/api/staff/manage/tours", f.CreateRequest() with { Configuration = input }, HttpStatusCode.BadRequest);
        await f.Send(HttpMethod.Post, "/api/staff/manage/tours", f.CreateRequest() with { RequestId = Guid.Empty }, HttpStatusCode.BadRequest);
        foreach (var query in new[] { "?size=101", "?page=0", "?state=INVALID", "?sort=robot", "?expand=route" })
            await f.Send(HttpMethod.Get, "/api/staff/manage/tours" + query, expected: HttpStatusCode.BadRequest);
        var id = await f.CreateTour();
        using var delete = new HttpRequestMessage(HttpMethod.Delete, $"/api/staff/manage/tours/{id}");
        delete.Headers.Authorization = new AuthenticationHeaderValue("Bearer", f.Admin);
        using var deleted = await f.Client.SendAsync(delete);
        Assert.Equal(HttpStatusCode.MethodNotAllowed, deleted.StatusCode);
        var detail = await f.Detail(id);
        await f.Send(HttpMethod.Put, $"/api/staff/manage/tours/{id}", new UpdateTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, null, f.Input() with { Name = "Other Admin" }), token: f.OtherAdmin);
        Assert.Equal(f.AdminId, (await f.Detail(id)).Tour.CreatedByUserId);
    }

    [SchemaV11Fact]
    public async Task NewTour_CannotStartFromALegacyRouteIdentity()
    {
        await using var f = await Fixture.Create();
        var request = f.CreateRequest();

        await f.Send(HttpMethod.Post, "/api/staff/manage/tours", request with { Configuration = request.Configuration with { RouteRevisionId = f.Route.Id } }, HttpStatusCode.NotFound);

        await using var db = f.Context();
        Assert.Empty(await db.Tours.ToArrayAsync());
        Assert.Empty(await db.AuditLogs.Where(a => a.Action == "TOUR_CREATED").ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task OptimisticConcurrency_HasOneWinner_AndNoOpPreservesVersionAndAudit()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var version = (await f.Detail(id)).Tour.RowVersion;
        await f.Send(HttpMethod.Put, $"/api/staff/manage/tours/{id}", new UpdateTourRequest(Guid.NewGuid(), version, null, f.Input()));
        Assert.Equal(version, (await f.Detail(id)).Tour.RowVersion);
        var responses = await Task.WhenAll(new[] { "First", "Second" }.Select(name => f.SendStatus(HttpMethod.Put, $"/api/staff/manage/tours/{id}",
            new UpdateTourRequest(Guid.NewGuid(), version, null, f.Input() with { Name = name }))));
        Assert.Single(responses, status => status == HttpStatusCode.OK);
        Assert.Single(responses, status => status == HttpStatusCode.Conflict);
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", new CancelTourRequest(Guid.NewGuid(), version, "stale"), HttpStatusCode.Conflict);
        await using var db = f.Context();
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "TOUR_UPDATED"));
    }

    [SchemaV11Fact]
    public async Task RouteAndScheduleChangesFailClosedWithoutConfiguredDuration()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var target = await f.NewRoute();
        var detail = await f.Detail(id);
        var input = f.Input() with { RouteId = target.Id, ScheduledStartAt = f.Input().ScheduledStartAt.AddDays(1).ToOffset(TimeSpan.FromHours(7)) };
        await f.Send(HttpMethod.Put, $"/api/staff/manage/tours/{id}", new UpdateTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, target.Version, input), HttpStatusCode.Conflict);
        detail = await f.Detail(id);
        Assert.Equal(f.Route!.Id, detail.Route!.Id);
        Assert.Equal(f.Route!.Id, detail.ActiveRoute!.Id);
        await using (var db = f.Context()) Assert.Empty(await db.TourEvents.ToArrayAsync());
        foreach (var state in new[] { "READY", "RUNNING", "COMPLETED", "CANCELLED" })
        {
            await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='{state}' WHERE Id='{id}';");
            detail = await f.Detail(id);
            Assert.False(detail.Permissions.CanEditMetadata);
            await f.Send(HttpMethod.Put, $"/api/staff/manage/tours/{id}", new UpdateTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, null, input with { Name = "Blocked" }), HttpStatusCode.Conflict);
            if (state != "READY") await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", new CancelTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, "Blocked"), HttpStatusCode.Conflict);
        }
    }

    [SchemaV11Fact]
    public async Task RepresentativeSubmissionLocksScheduleAndRoute_ButMetadataCorrectionPreservesRegistration()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var registration = await f.Submit(id);
        var target = await f.NewRoute();
        var detail = await f.Detail(id);
        Assert.False(detail.Permissions.CanChangeScheduleAndRoute);
        foreach (var input in new[] { f.Input() with { ScheduledStartAt = f.Input().ScheduledStartAt.AddDays(1) }, f.Input() with { RouteId = target.Id } })
            await f.Send(HttpMethod.Put, $"/api/staff/manage/tours/{id}", new UpdateTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, target.Version, input), HttpStatusCode.Conflict);
        var approvedBefore = await f.Send(HttpMethod.Get, $"/api/staff/manage/registrations/{registration}");
        await f.Send(HttpMethod.Put, $"/api/staff/manage/tours/{id}", new UpdateTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, null, f.Input() with { Description = "Corrected info" }));
        var after = await f.Send(HttpMethod.Get, $"/api/staff/manage/registrations/{registration}");
        Assert.Equal(approvedBefore.GetProperty("rowVersion").GetString(), after.GetProperty("rowVersion").GetString());
        Assert.NotEqual(approvedBefore.GetProperty("tourRowVersion").GetString(), after.GetProperty("tourRowVersion").GetString());
        Assert.Equal("SUBMITTED", after.GetProperty("summary").GetProperty("state").GetString());
    }

    [SchemaV11Fact]
    public async Task CancelRevokesAccessAtomically_PreservesDecisionsAndCannotGrantPostStartFallback()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var registration = await f.Submit(id);
        var session = await f.ApproveAndJoin(id, registration);
        var detail = await f.Detail(id);
        var cancel = new CancelTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, "  Cancelled by test  ");
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", cancel);
        detail = await f.Detail(id);
        Assert.Equal("CANCELLED", detail.Tour.State);
        Assert.Null(detail.StartedAt);
        Assert.NotNull(detail.EndedAt);
        Assert.Equal("Cancelled by test", detail.EndReason);
        await f.Send(HttpMethod.Post, $"/api/student/tours/{id}/join", new { accessCode = session.Code }, HttpStatusCode.Unauthorized);
        using (var request = new HttpRequestMessage(HttpMethod.Post, $"/api/student/tours/{id}/session"))
        {
            request.Headers.Add("Cookie", session.Cookie);
            using var response = await f.Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        await f.Send(HttpMethod.Post, $"/api/representative/tours/{id}/registrations", await f.RegistrationInput(id), HttpStatusCode.Conflict, f.Representative, Guid.NewGuid());
        await using var db = f.Context();
        Assert.Equal("APPROVED", (await db.GroupRegistrations.SingleAsync()).State);
        Assert.All(await db.Invitations.ToArrayAsync(), invitation => Assert.NotNull(invitation.RevokedAt));
        Assert.All(await db.BrowserSessions.ToArrayAsync(), browser => { Assert.NotNull(browser.EndedAt); Assert.Equal("INVITATION_REVOKED", browser.EndReason); });
        var revoked = await db.Invitations.SingleAsync();
        await f.Send(HttpMethod.Post, $"/api/registrations/{registration}/invitations/{revoked.Id}/resend", new {
            requestId = Guid.NewGuid(), expectedRowVersion = Convert.ToBase64String(revoked.RowVersion) }, HttpStatusCode.Conflict);
        var version = detail.Tour.RowVersion;
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", cancel);
        Assert.Equal(version, (await f.Detail(id)).Tour.RowVersion);
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "TOUR_CANCELLED"));
        Assert.False((await f.Detail(id)).Route!.Usage.CanEditConfiguration);
    }

    [SchemaV11Fact]
    public async Task ListPhases_GroupStatesAndHideOnlyWhatTheyShould()
    {
        await using var f = await Fixture.Create();
        await using (var db = f.Context())
        {
            void Add(string name, string state, DateTimeOffset start) => db.Tours.Add(new Tour { Id = Guid.NewGuid(), Name = name, RouteId = f.Route.Id, ActiveRouteId = f.Route.Id,
                ScheduledStartAt = start, State = state, CreatedByUserId = f.AdminId, CreatedAt = f.Now });
            Add("scheduled", "SCHEDULED", f.Now.AddDays(5));
            Add("ready", "READY", f.Now.AddDays(6));
            Add("overdue", "SCHEDULED", f.Now.AddDays(-1));
            Add("running", "RUNNING", f.Now.AddHours(-1));
            Add("completed", "COMPLETED", f.Now.AddDays(-2));
            Add("cancelled", "CANCELLED", f.Now.AddDays(4));
            await db.SaveChangesAsync();
        }
        async Task<string[]> Names(string query) => (await f.Send(HttpMethod.Get, "/api/staff/manage/tours" + query))
            .EnumerateArray().Select(tour => tour.GetProperty("name").GetString()!).Order().ToArray();
        Assert.Equal(["ready", "scheduled"], await Names("?phase=UPCOMING"));
        Assert.Equal(["running"], await Names("?phase=RUNNING"));
        Assert.Equal(["cancelled", "completed"], await Names("?phase=FINISHED"));
        Assert.Equal(6, (await Names("")).Length);
        Assert.Equal(["overdue", "scheduled"], await Names("?state=SCHEDULED"));
        await f.Send(HttpMethod.Get, "/api/staff/manage/tours?phase=ARCHIVED", expected: HttpStatusCode.BadRequest);
    }

    [SchemaV11Fact]
    public async Task CancelledTour_StaysVisibleToItsRepresentative_WithTheReason_AndClosedToChanges()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var registration = await f.Submit(id);
        await f.ApproveAndJoin(id, registration);
        var detail = await f.Detail(id);
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", new CancelTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, "Robot cần bảo trì"));

        var listed = Assert.Single((await f.Send(HttpMethod.Get, "/api/representative/registrations?group=closed", token: f.Representative)).EnumerateArray());
        Assert.Equal("CANCELLED", listed.GetProperty("tourState").GetString());
        Assert.Equal("APPROVED", listed.GetProperty("state").GetString());
        Assert.Equal("Robot cần bảo trì", listed.GetProperty("tourCancelReason").GetString());
        var read = await f.Send(HttpMethod.Get, $"/api/representative/registrations/{registration}", token: f.Representative);
        Assert.Equal("Robot cần bảo trì", read.GetProperty("summary").GetProperty("tourCancelReason").GetString());
        Assert.False(read.GetProperty("allowedActions").GetProperty("edit").GetProperty("allowed").GetBoolean());
        var tour = await f.Send(HttpMethod.Get, $"/api/representative/tours/{id}", token: f.Representative);
        Assert.Equal("CANCELLED", tour.GetProperty("state").GetString());
        Assert.Equal("Robot cần bảo trì", tour.GetProperty("cancelReason").GetString());
        Assert.False(tour.GetProperty("register").GetProperty("allowed").GetBoolean());
    }

    [SchemaV11Fact]
    public async Task VersionedAvailabilityEndpoints_LeaveLegacyRoutesAlone()
    {
        await using var f = await Fixture.Create();
        var token = new string('A', 64);
        foreach (var action in new[] { "deactivate", "activate" })
            await f.Send(HttpMethod.Post, $"/api/staff/routes/{f.Route.Id}/{action}", new RouteAvailabilityRequest(Guid.NewGuid(), token), HttpStatusCode.NotFound);
        await f.Send(HttpMethod.Get, $"/api/staff/routes/{f.Route.Id}/scheduled-tours", expected: HttpStatusCode.NotFound);
        await using var db = f.Context();
        var route = await db.Routes.SingleAsync(r => r.Id == f.Route.Id);
        Assert.True(route.IsActive);
        Assert.Null(route.UpdatedAt);
        Assert.Equal(0, await db.AuditLogs.CountAsync(a => a.EntityType == "Route"));
    }

    [SchemaV11Fact]
    public async Task CancellationAuditFailure_RollsBackTourInvitationsSessionsAndReceipt()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var registration = await f.Submit(id);
        await f.ApproveAndJoin(id, registration);
        var pendingInput = RepresentativeEndpointTests.Input(await f.Send(HttpMethod.Get, $"/api/representative/tours/{id}", token: f.Representative), "Pending group", "pending@example.test");
        await f.Database.InsertUserAsync(true, username: "tour.pending.rep", roles: ["SCHOOL_REPRESENTATIVE"]);
        var pendingRepresentative = await RepresentativeEndpointTests.LoginAsync(f.Client, "tour.pending.rep");
        var pending = (await f.Send(HttpMethod.Post, $"/api/representative/tours/{id}/registrations", pendingInput, token: pendingRepresentative, key: Guid.NewGuid())).GetProperty("id").GetGuid();
        var version = (await f.Detail(id)).Tour.RowVersion;
        var cancel = new CancelTourRequest(Guid.NewGuid(), version, "Audit failure");
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs ADD CONSTRAINT CK_TestTourCancel CHECK (Action <> 'TOUR_CANCELLED');");
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", cancel, HttpStatusCode.InternalServerError);
        Assert.Equal(version, (await f.Detail(id)).Tour.RowVersion);
        await using (var db = f.Context())
        {
            Assert.All(await db.Invitations.ToArrayAsync(), i => Assert.Null(i.RevokedAt));
            Assert.All(await db.BrowserSessions.ToArrayAsync(), s => Assert.Null(s.EndedAt));
            Assert.Empty(await db.AuditLogs.Where(a => a.Action == "TOUR_INVITATION_REVOKED").ToArrayAsync());
            Assert.Equal("SUBMITTED", (await db.GroupRegistrations.SingleAsync(r => r.Id == pending)).State);
        }
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs DROP CONSTRAINT CK_TestTourCancel;");
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", cancel);
        await using (var db = f.Context())
        {
            Assert.Equal("CANCELLED", (await db.GroupRegistrations.SingleAsync(r => r.Id == pending)).State);
            Assert.Equal("APPROVED", (await db.GroupRegistrations.SingleAsync(r => r.Id == registration)).State);
        }
        Assert.Empty((await f.Send(HttpMethod.Get, "/api/staff/manage/registrations?state=SUBMITTED")).EnumerateArray());
    }

    [SchemaV11Fact]
    public async Task CancelRacingSubmission_UsesTheSameTourLock_AndCreatesNoOrphanRegistration()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var detail = await f.Detail(id);
        var input = await f.RegistrationInput(id);
        var results = await Task.WhenAll(
            f.SendStatus(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", new CancelTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, "Race")),
            f.SendStatus(HttpMethod.Post, $"/api/representative/tours/{id}/registrations", input, f.Representative, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.OK, results[0]);
        Assert.Contains(results[1], new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
        Assert.Equal("CANCELLED", (await f.Detail(id)).Tour.State);
        await using var db = f.Context();
        Assert.All(await db.GroupRegistrations.ToArrayAsync(), r => { Assert.Equal(id, r.TourId); Assert.Equal("CANCELLED", r.State); });
        Assert.Empty(await db.Invitations.ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task CreateBlockerDoesNotWriteSuccessReceiptOrTour()
    {
        await using var f = await Fixture.Create();
        var request = f.CreateRequest();
        await f.Send(HttpMethod.Post, "/api/staff/manage/tours", request, HttpStatusCode.NotFound);
        await using (var db = f.Context()) Assert.Empty(await db.Tours.ToArrayAsync());
        await using (var db = f.Context()) Assert.Empty(await db.AuditLogs.Where(a => a.Action == "TOUR_CREATED").ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task ScheduleChangeRacingRegistration_HasExactlyOneWinner()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var detail = await f.Detail(id);
        var input = await f.RegistrationInput(id);
        var changed = f.Input() with { ScheduledStartAt = f.Input().ScheduledStartAt.AddDays(1) };
        var results = await Task.WhenAll(
            f.SendStatus(HttpMethod.Put, $"/api/staff/manage/tours/{id}", new UpdateTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, null, changed)),
            f.SendStatus(HttpMethod.Post, $"/api/representative/tours/{id}/registrations", input, f.Representative, Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Conflict, results[0]);
        Assert.Equal(HttpStatusCode.OK, results[1]);
        await using var db = f.Context();
        Assert.Single(await db.GroupRegistrations.ToArrayAsync());
        Assert.Equal(f.Input().ScheduledStartAt, (await f.Detail(id)).Tour.ScheduledStartAt);
    }

    [SchemaV11Fact]
    public async Task ReadyCancellationRetainsPreparedBranchConfiguration()
    {
        await using var f = await Fixture.Create();
        var id = await f.CreateTour();
        var branch = await f.NewRoute();
        var variantId = Guid.NewGuid();
        await f.Database.ExecuteAsync($"""
            INSERT dbo.RouteVariants (Id, BaseRouteId, BranchPointRouteStopId, VariantRouteId, VariantBranchStopId, Name, IsActive, CreatedAt)
            VALUES ('{variantId}', '{f.Route.Id}', '{f.Route.Stops[0].Id}', '{branch.Id}', '{branch.Stops[0].Id}', N'Test branch', 1, SYSDATETIMEOFFSET());
            INSERT dbo.TourAllowedBranches (Id, TourId, RouteVariantId, IsEnabled, CreatedAt)
            VALUES ('{Guid.NewGuid()}', '{id}', '{variantId}', 1, SYSDATETIMEOFFSET());
            UPDATE dbo.Tours SET State='READY' WHERE Id='{id}';
            """);
        var detail = await f.Detail(id);
        Assert.True(detail.Usage.HasAllowedBranches);
        Assert.True(detail.Permissions.CanCancel);
        Assert.False(detail.Permissions.CanChangeScheduleAndRoute);
        await f.Send(HttpMethod.Post, $"/api/staff/manage/tours/{id}/cancel", new CancelTourRequest(Guid.NewGuid(), detail.Tour.RowVersion, "Before Start"));
        await using var db = f.Context();
        Assert.Single(await db.TourAllowedBranches.ToArrayAsync());
        Assert.Single(await db.RouteVariants.ToArrayAsync());
        Assert.Empty(await db.Robots.ToArrayAsync());
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private sealed class Fixture(InitialAdminSeederTests.EmptySchemaDatabase database, PoiManagementEndpointTests.ApiHost host, Guid adminId) : IAsyncDisposable
    {
        public InitialAdminSeederTests.EmptySchemaDatabase Database => database;
        public HttpClient Client => host.Client;
        public Guid AdminId => adminId;
        public string Admin { get; private set; } = "";
        public string OtherAdmin { get; private set; } = "";
        public string SystemAdmin { get; private set; } = "";
        public string Representative { get; private set; } = "";
        public string Staff { get; private set; } = "";
        public Guid[] PoiIds { get; } = [Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()];
        public RouteDetails Route { get; set; } = null!;
        public DateTimeOffset Now { get; } = DateTimeOffset.FromUnixTimeMilliseconds(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        public ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);
        public TourInput Input() => new("SQL Tour", null, Route.Id, Now.AddDays(10), null);
        public CreateTourInput CreateInput() => new("SQL Tour", null, Guid.NewGuid(), "no-such-robot", AdminId,
            TourSchedule.SlotStart(DateOnly.FromDateTime(Now.UtcDateTime).AddDays(10), new TimeOnly(9, 0)), null);
        public CreateTourRequest CreateRequest() => new(Guid.NewGuid(), CreateInput());
        public static async Task<Fixture> Create()
        {
            var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
            PoiManagementEndpointTests.ApiHost? host = null;
            try
            {
                var admin = await database.InsertUserAsync(true, username: "tour.admin", roles: ["STAFF"]);
                await database.InsertUserAsync(true, username: "tour.other", roles: ["STAFF"]);
                await database.InsertUserAsync(true, username: "tour.systemadmin", roles: ["ADMIN"]);
                await database.InsertUserAsync(true, username: "tour.rep", roles: ["SCHOOL_REPRESENTATIVE"]);
                await database.InsertUserAsync(true, username: "tour.staff", roles: ["STAFF"]);
                var settings = InvitationPrimitiveTests.ConfigurationValues().ToDictionary(p => p.Key.Replace(":", "__"), p => p.Value);
                host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(database.ConnectionString, settings);
                var f = new Fixture(database, host, admin.Id);
                f.Admin = await RepresentativeEndpointTests.LoginAsync(f.Client, "tour.admin");
                f.OtherAdmin = await RepresentativeEndpointTests.LoginAsync(f.Client, "tour.other");
                f.SystemAdmin = await RepresentativeEndpointTests.LoginAsync(f.Client, "tour.systemadmin");
                f.Representative = await RepresentativeEndpointTests.LoginAsync(f.Client, "tour.rep");
                f.Staff = await RepresentativeEndpointTests.LoginAsync(f.Client, "tour.staff");
                await using (var db = f.Context())
                {
                    db.Pois.AddRange(f.PoiIds.Select((id, index) => new Poi { Id = id, Name = $"Test POI {index}",
                        MapKey = "tour-test-map", MapFrame = "map", IsActive = true, CreatedAt = f.Now }));
                    await db.SaveChangesAsync();
                }
                f.Route = await f.NewRoute();
                return f;
            }
            catch
            {
                if (host is not null) await host.DisposeAsync();
                await database.DisposeAsync();
                throw;
            }
        }
        public async Task<RouteDetails> NewRoute()
        {
            var id = Guid.NewGuid();
            await using (var db = Context())
            {
                db.Routes.Add(new Route { Id = id, Name = "SQL route", MapKey = "tour-test-map", MapFrame = "map",
                    StartX = 0, StartY = 0, StartYaw = 0, EndMode = "LAST_POI", IsActive = true,
                    AuthoringMode = "LEGACY", CreatedAt = Now });
                db.RouteStops.AddRange(PoiIds.Select((poiId, index) => new RouteStop { Id = Guid.NewGuid(), RouteId = id,
                    PoiId = poiId, StopOrder = index + 1, DwellSeconds = 30, HeadStepsJson = "[{\"preset\":\"FRONT\",\"holdSeconds\":30}]" }));
                await db.SaveChangesAsync();
            }
            return (await Send(HttpMethod.Get, $"/api/staff/manage/routes/{id}")).Deserialize<RouteDetails>(Json)!;
        }
        // Tour fixtures are inserted directly because target scheduling is intentionally blocked until
        // an approved configured-duration source exists. API creation has its own fail-closed test.
        public async Task<Guid> CreateTour()
        {
            var id = Guid.NewGuid();
            await using var db = Context();
            db.Tours.Add(new Tour { Id = id, Name = Input().Name, RouteId = Route.Id, ActiveRouteId = Route.Id,
                ScheduledStartAt = Input().ScheduledStartAt, State = "SCHEDULED", CreatedByUserId = AdminId, CreatedAt = Now });
            await db.SaveChangesAsync();
            return id;
        }
        public async Task<TourDetails> Detail(Guid id) => (await Send(HttpMethod.Get, $"/api/staff/manage/tours/{id}")).Deserialize<TourDetails>(Json)!;
        public async Task<object> RegistrationInput(Guid tour) => RepresentativeEndpointTests.Input(
            await Send(HttpMethod.Get, $"/api/representative/tours/{tour}", token: Representative), "Test group", "viewer@example.test");
        public async Task<Guid> Submit(Guid tour) => (await Send(HttpMethod.Post, $"/api/representative/tours/{tour}/registrations",
            await RegistrationInput(tour), token: Representative, key: Guid.NewGuid())).GetProperty("id").GetGuid();
        public async Task<(string Code, string Cookie)> ApproveAndJoin(Guid tour, Guid registration)
        {
            var detail = await Send(HttpMethod.Get, $"/api/staff/manage/registrations/{registration}");
            foreach (var row in detail.GetProperty("roster").EnumerateArray().ToArray())
            {
                detail = await Send(HttpMethod.Get, $"/api/staff/manage/registrations/{registration}");
                var current = detail.GetProperty("roster").EnumerateArray()
                    .Single(item => item.GetProperty("id").GetGuid() == row.GetProperty("id").GetGuid());
                await Send(HttpMethod.Post, $"/api/staff/manage/registrations/{registration}/rows/{current.GetProperty("id").GetGuid()}/accept", new {
                    requestId = Guid.NewGuid(), expectedRegistrationRowVersion = detail.GetProperty("rowVersion").GetString(),
                    expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
                    expectedRowVersion = current.GetProperty("rowVersion").GetString() });
            }
            await using var db = Context();
            var invitation = await db.Invitations.OrderBy(i => i.CreatedAt).FirstAsync();
            var code = new InvitationCodeService(InvitationPrimitiveTests.Configuration()).Reveal(invitation.Id, invitation.AccessVersion, invitation.AccessCodeProtected);
            using var request = Request(HttpMethod.Post, $"/api/student/tours/{tour}/join", new { accessCode = code }, null);
            using var response = await Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var cookies = response.Headers.GetValues("Set-Cookie").Select(value => value.Split(';')[0]);
            return (code, string.Join("; ", cookies));
        }
        private static HttpRequestMessage Request(HttpMethod method, string path, object? body, string? token, Guid? key = null)
        {
            var request = new HttpRequestMessage(method, path);
            if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (key.HasValue) request.Headers.Add("Idempotency-Key", key.Value.ToString("D"));
            if (body is not null) request.Content = JsonContent.Create(body);
            return request;
        }
        public async Task<JsonElement> Send(HttpMethod method, string path, object? body = null, HttpStatusCode expected = HttpStatusCode.OK, string? token = null, Guid? key = null)
        {
            using var request = Request(method, path, body, token ?? Admin, key);
            using var response = await Client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == expected, $"{method} {path}: expected {expected}, got {response.StatusCode}: {text}");
            if (string.IsNullOrEmpty(text)) return default;
            using var json = JsonDocument.Parse(text);
            return json.RootElement.TryGetProperty("data", out var data) ? data.Clone() : default;
        }
        public async Task<JsonElement> SendBody(HttpMethod method, string path, object? body = null,
            HttpStatusCode expected = HttpStatusCode.OK, string? token = null, Guid? key = null)
        {
            using var request = Request(method, path, body, token ?? Admin, key);
            using var response = await Client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == expected, $"{method} {path}: expected {expected}, got {response.StatusCode}: {text}");
            using var json = JsonDocument.Parse(text);
            return json.RootElement.Clone();
        }
        public async Task<HttpStatusCode> SendStatus(HttpMethod method, string path, object body, string? token = null, Guid? key = null)
        {
            using var request = Request(method, path, body, token ?? Admin, key);
            using var response = await Client.SendAsync(request);
            return response.StatusCode;
        }
        public async ValueTask DisposeAsync() { await host.DisposeAsync(); await database.DisposeAsync(); }
    }
}
