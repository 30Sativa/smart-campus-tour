using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.IntegrationTests;

public sealed class RepresentativeEndpointTests
{
    [SchemaV11Fact]
    public async Task RealSql_LifecyclePreservesOwnershipRowsAndHistory_AndReplaysAfterRestart()
    {
        await using var fixture = await Fixture.CreateAsync();
        Guid id;
        var key = Guid.NewGuid();
        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var body = Input(tour, "Mixed", "one@example.com", mixed: true);
        await using (var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString))
        {
            var token = await LoginAsync(host.Client, "rep.one");
            fixture.Bind(host.Client, token);
            var created = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", body, key);
            Assert.Equal(HttpStatusCode.OK, created.Status);
            id = created.Data.GetProperty("id").GetGuid();
            var details = await fixture.DataAsync($"/registrations/{id}");
            Assert.Equal("SUBMITTED", details.GetProperty("summary").GetProperty("state").GetString());
            Assert.Equal(2, details.GetProperty("roster").GetArrayLength());
            Assert.Equal("SHARED_VIEWING", details.GetProperty("roster")[1].GetProperty("rowType").GetString());
            Assert.Equal("one@example.com", details.GetProperty("roster")[0].GetProperty("email").GetString());
            var another = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", Input(tour, "Shared only", "room2@example.com", sharedOnly: true), Guid.NewGuid());
            Assert.Equal(HttpStatusCode.OK, another.Status);
            Assert.NotEqual(id, another.Data.GetProperty("id").GetGuid());
            var list = await fixture.SendAsync(HttpMethod.Get, "/registrations?size=1");
            Assert.Single(list.Data.EnumerateArray());
            Assert.Equal(2, list.Body.GetProperty("pagination").GetProperty("totalItems").GetInt32());
            Assert.Equal(0, await fixture.Database.CountRowsAsync("dbo.Invitations"));

            var updateBody = new { input = Input(tour, "Updated", "new@example.com"), expectedRowVersion = Version(details) };
            var updated = await fixture.SendAsync(HttpMethod.Put, $"/registrations/{id}", updateBody);
            Assert.Equal(HttpStatusCode.OK, updated.Status);
            Assert.Equal(JsonValueKind.Null, updated.Data.ValueKind);
            Assert.Equal(HttpStatusCode.Conflict, (await fixture.SendAsync(HttpMethod.Put, $"/registrations/{id}", updateBody)).Status);
            details = await fixture.DataAsync($"/registrations/{id}");
            Assert.Single(details.GetProperty("roster").EnumerateArray());
            Assert.NotEqual(Version(details), updateBody.expectedRowVersion);
            await using (var db = fixture.Context())
            {
                Assert.Equal(2, await db.RosterRows.CountAsync(r => r.RegistrationId == id && !r.IsActive));
                Assert.Equal(1, await db.RosterRows.CountAsync(r => r.RegistrationId == id && r.IsActive));
                Assert.All(await db.AuditLogs.ToArrayAsync(), audit => Assert.Null(audit.DataJson));
            }
            await fixture.Database.ExecuteAsync($"UPDATE dbo.Tours SET ScheduledStartAt=DATEADD(hour,1,ScheduledStartAt) WHERE Id='{fixture.TourId}';");
            Assert.Equal(HttpStatusCode.Conflict, (await fixture.SendAsync(HttpMethod.Put, $"/registrations/{id}",
                new { input = Input(tour, "Stale schedule", "new@example.com"), expectedRowVersion = Version(details) })).Status);
            tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
            var cancelBody = new { expectedRowVersion = Version(details), expectedTourRowVersion = tour.GetProperty("rowVersion").GetString() };
            Assert.Equal(HttpStatusCode.OK, (await fixture.SendAsync(HttpMethod.Post, $"/registrations/{id}/cancel", cancelBody)).Status);
            details = await fixture.DataAsync($"/registrations/{id}");
            Assert.Equal("CANCELLED", details.GetProperty("summary").GetProperty("state").GetString());

            // Cancellation releases the email, so the original group must recheck on re-registration.
            Assert.Equal(HttpStatusCode.OK, (await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations",
                Input(tour, "Takes released email", "new@example.com"), Guid.NewGuid())).Status);
            var resubmit = await fixture.SendAsync(HttpMethod.Post, $"/registrations/{id}/resubmit",
                new { input = Input(tour, "Original again", "new@example.com"), expectedRowVersion = Version(details) });
            Assert.Equal(HttpStatusCode.Conflict, resubmit.Status);
            Assert.Equal(HttpStatusCode.OK, (await fixture.SendAsync(HttpMethod.Post, $"/registrations/{id}/resubmit",
                new { input = Input(tour, "Original again", "different@example.com"), expectedRowVersion = Version(details) })).Status);
            details = await fixture.DataAsync($"/registrations/{id}");
            Assert.Equal(id, details.GetProperty("summary").GetProperty("id").GetGuid());
            Assert.Equal("SUBMITTED", details.GetProperty("summary").GetProperty("state").GetString());
            // A committed key still replays even after Tour/registration states change.
            await fixture.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='READY' WHERE Id='{fixture.TourId}';");
        }
        await using (var restarted = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString))
        {
            fixture.Bind(restarted.Client, await LoginAsync(restarted.Client, "rep.one"));
            var replay = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", body, key);
            Assert.Equal(HttpStatusCode.OK, replay.Status);
            Assert.Equal(id, replay.Data.GetProperty("id").GetGuid());
            Assert.Equal(HttpStatusCode.Conflict, (await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", body, Guid.NewGuid())).Status);
            Assert.Equal(HttpStatusCode.OK, (await fixture.SendAsync(HttpMethod.Get, $"/tours/{fixture.TourId}")).Status);
        }
    }

    [SchemaV11Fact]
    public async Task AuthorizationAndValidation_ReturnRelevantStatusesAndNeverWritePartialData()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString);
        fixture.Bind(host.Client, null);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fixture.SendAsync(HttpMethod.Get, "/tours")).Status);
        fixture.Bind(host.Client, await LoginAsync(host.Client, "rep.admin"));
        Assert.Equal(HttpStatusCode.Forbidden, (await fixture.SendAsync(HttpMethod.Get, "/registrations")).Status);
        fixture.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        foreach (var query in new[] { "/tours?page=0", "/tours?size=101", "/tours?sort=capacity", "/registrations?state=UNKNOWN", "/tours?expand=route" })
            Assert.Equal(HttpStatusCode.BadRequest, (await fixture.SendAsync(HttpMethod.Get, query)).Status);
        var body = Input(tour, "A", "person@example.com");
        Assert.Equal(HttpStatusCode.BadRequest, (await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", body)).Status);
        var invalid = body with { GroupName = "", Roster = [new(2, "BAD", "A", "bad", null), new(2, "INDIVIDUAL", "", "bad", null)] };
        var bad = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", invalid, Guid.NewGuid());
        Assert.Equal(HttpStatusCode.BadRequest, bad.Status);
        Assert.Contains(bad.Body.GetProperty("errors").EnumerateObject(), p => p.Name.Contains("Roster[0]"));
        Assert.Equal(0, await fixture.Database.CountRowsAsync("dbo.GroupRegistrations"));
        Assert.Equal(0, await fixture.Database.CountRowsAsync("dbo.RosterRows"));
        Assert.Equal(0, await fixture.Database.CountRowsAsync("dbo.AuditLogs"));
        var injectedOwner = JsonSerializer.SerializeToNode(body)!;
        injectedOwner["representativeUserId"] = Guid.NewGuid().ToString("D");
        Assert.Equal(HttpStatusCode.BadRequest, (await fixture.SendAsync(HttpMethod.Post,
            $"/tours/{fixture.TourId}/registrations", injectedOwner, Guid.NewGuid())).Status);
        var created = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", body, Guid.NewGuid());
        var id = created.Data.GetProperty("id").GetGuid();
        var details = await fixture.DataAsync($"/registrations/{id}");
        fixture.Bind(host.Client, await LoginAsync(host.Client, "rep.two"));
        Assert.Equal(0, (await fixture.SendAsync(HttpMethod.Get, "/registrations")).Data.GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.SendAsync(HttpMethod.Get, $"/registrations/{id}")).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.SendAsync(HttpMethod.Put, $"/registrations/{id}", new { input = body, expectedRowVersion = Version(details) })).Status);
        foreach (var action in new[] { "resubmit", "cancel" })
        {
            var payload = action == "cancel" ? (object)new { expectedRowVersion = Version(details), expectedTourRowVersion = tour.GetProperty("rowVersion").GetString() } :
                new { input = body, expectedRowVersion = Version(details) };
            Assert.Equal(HttpStatusCode.NotFound, (await fixture.SendAsync(HttpMethod.Post, $"/registrations/{id}/{action}", payload)).Status);
        }
        var conflict = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", Input(tour, "B", " PERSON@EXAMPLE.COM "), Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Conflict, conflict.Status);
        Assert.DoesNotContain("person@example.com", conflict.Body.GetRawText(), StringComparison.OrdinalIgnoreCase);
    }

    [SchemaV11Fact]
    public async Task ConcurrentSubmissionsAndUpdates_SerializeEmailsKeysAndVersions()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString);
        fixture.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var path = $"/tours/{fixture.TourId}/registrations";
        var key = Guid.NewGuid();
        var body = Input(tour, "Same intent", "same@example.com");
        var pair = await Task.WhenAll(fixture.SendAsync(HttpMethod.Post, path, body, key), fixture.SendAsync(HttpMethod.Post, path, body, key));
        Assert.All(pair, r => Assert.Equal(HttpStatusCode.OK, r.Status));
        var id = pair[0].Data.GetProperty("id").GetGuid();
        Assert.Equal(id, pair[1].Data.GetProperty("id").GetGuid());
        Assert.Equal(1, await fixture.Database.CountRowsAsync("dbo.GroupRegistrations"));
        var otherToken = await LoginAsync(host.Client, "rep.two");
        var races = await Task.WhenAll(fixture.SendAsync(HttpMethod.Post, path, Input(tour, "A", "RACE@example.com"), Guid.NewGuid()),
            fixture.SendAsync(HttpMethod.Post, path, Input(tour, "B", "race@example.com"), Guid.NewGuid(), otherToken));
        Assert.Equal(1, races.Count(r => r.Status == HttpStatusCode.OK));
        Assert.Equal(1, races.Count(r => r.Status == HttpStatusCode.Conflict));
        var details = await fixture.DataAsync($"/registrations/{id}");
        var payload = new { input = Input(tour, "Changed", "same@example.com"), expectedRowVersion = Version(details) };
        var updates = await Task.WhenAll(fixture.SendAsync(HttpMethod.Put, $"/registrations/{id}", payload),
            fixture.SendAsync(HttpMethod.Put, $"/registrations/{id}", payload));
        Assert.Equal(1, updates.Count(r => r.Status == HttpStatusCode.OK));
        Assert.Equal(1, updates.Count(r => r.Status == HttpStatusCode.Conflict));
        await using var context = fixture.Context();
        Assert.Equal(1, await context.AuditLogs.CountAsync(a => a.CorrelationId == key));
        Assert.Equal(1, await context.AuditLogs.CountAsync(a => a.Action == "REGISTRATION_UPDATED"));
    }

    [SchemaV11Fact]
    public async Task RejectionAndApprovalAndTourLocks_AreCheckedAgainstPersistence()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString);
        fixture.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var body = Input(tour, "States", "states@example.com");
        var created = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", body, Guid.NewGuid());
        var id = created.Data.GetProperty("id").GetGuid();
        await fixture.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='REJECTED', RejectionReason=N'Fix list', ReviewedAt=SYSDATETIMEOFFSET(), ReviewedByUserId='{fixture.AdminId}' WHERE Id='{id}';");
        var details = await fixture.DataAsync($"/registrations/{id}");
        Assert.True(details.GetProperty("allowedActions").GetProperty("resubmit").GetProperty("allowed").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await fixture.SendAsync(HttpMethod.Post, $"/registrations/{id}/resubmit", new { input = body, expectedRowVersion = Version(details) })).Status);
        details = await fixture.DataAsync($"/registrations/{id}");
        Assert.Equal(JsonValueKind.Null, details.GetProperty("rejectionReason").ValueKind);
        Assert.Equal(JsonValueKind.Null, details.GetProperty("reviewedAt").ValueKind);
        await fixture.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='APPROVED' WHERE Id='{id}';");
        details = await fixture.DataAsync($"/registrations/{id}");
        Assert.False(details.GetProperty("allowedActions").GetProperty("cancel").GetProperty("allowed").GetBoolean());
        var cancel = new { expectedRowVersion = Version(details), expectedTourRowVersion = tour.GetProperty("rowVersion").GetString() };
        Assert.Equal(HttpStatusCode.Conflict, (await fixture.SendAsync(HttpMethod.Post, $"/registrations/{id}/cancel", cancel)).Status);
        Assert.Equal(HttpStatusCode.Conflict, (await fixture.SendAsync(HttpMethod.Put, $"/registrations/{id}", new { input = body, expectedRowVersion = Version(details) })).Status);
        foreach (var state in new[] { "READY", "RUNNING", "COMPLETED", "CANCELLED" })
        {
            await fixture.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='{state}' WHERE Id='{fixture.TourId}';");
            var currentTour = await fixture.DataAsync($"/tours/{fixture.TourId}");
            Assert.Equal(0, (await fixture.SendAsync(HttpMethod.Get, "/tours")).Data.GetArrayLength());
            Assert.Equal(HttpStatusCode.Conflict, (await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", Input(currentTour, "No", "no@example.com"), Guid.NewGuid())).Status);
            Assert.Equal(HttpStatusCode.NotFound, (await fixture.SendAsync(HttpMethod.Get, $"/tours/{fixture.TourId}", token: await LoginAsync(host.Client, "rep.two"))).Status);
        }
        Assert.Equal(1, await fixture.Database.CountRowsAsync("dbo.GroupRegistrations"));
    }

    [SchemaV11Fact]
    public async Task EmailReservation_FollowsReviewStateAcrossRepresentatives()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString);
        fixture.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var path = $"/tours/{fixture.TourId}/registrations";
        var created = await fixture.SendAsync(HttpMethod.Post, path, Input(tour, "Reviewed group", "held@example.com"), Guid.NewGuid());
        var id = created.Data.GetProperty("id").GetGuid();
        var otherToken = await LoginAsync(host.Client, "rep.two");

        // An APPROVED row keeps its normalized email reserved for every group in the Tour.
        await fixture.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='APPROVED', ReviewedAt=SYSDATETIMEOFFSET(), ReviewedByUserId='{fixture.AdminId}' WHERE Id='{id}';");
        var blocked = await fixture.SendAsync(HttpMethod.Post, path, Input(tour, "Other school", " Held@Example.COM "), Guid.NewGuid(), otherToken);
        Assert.Equal(HttpStatusCode.Conflict, blocked.Status);
        Assert.DoesNotContain("Reviewed group", blocked.Body.GetRawText());
        Assert.Equal("EMAIL_RESERVED", blocked.Body.GetProperty("errors").GetProperty("code").GetString());
        Assert.Contains("Roster[0].Email", blocked.Body.GetProperty("errors").GetProperty("fields").EnumerateObject().Select(p => p.Name));

        // REJECTED releases it, so resubmitting the original group must recheck and leave it unchanged.
        await fixture.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='REJECTED', RejectionReason=N'Fix list' WHERE Id='{id}';");
        Assert.Equal(HttpStatusCode.OK, (await fixture.SendAsync(HttpMethod.Post, path, Input(tour, "Other school", "held@example.com"), Guid.NewGuid(), otherToken)).Status);
        var details = await fixture.DataAsync($"/registrations/{id}");
        var resubmit = await fixture.SendAsync(HttpMethod.Post, $"/registrations/{id}/resubmit",
            new { input = Input(tour, "Reviewed group", "held@example.com"), expectedRowVersion = Version(details) });
        Assert.Equal(HttpStatusCode.Conflict, resubmit.Status);
        details = await fixture.DataAsync($"/registrations/{id}");
        Assert.Equal("REJECTED", details.GetProperty("summary").GetProperty("state").GetString());
        Assert.Equal("Fix list", details.GetProperty("rejectionReason").GetString());
        await using var context = fixture.Context();
        Assert.Equal(0, await context.AuditLogs.CountAsync(a => a.Action == "REGISTRATION_RESUBMITTED"));
    }

    [SchemaV11Fact]
    public async Task InvitationHistory_RemainsReadOnlyEvenIfAnOldRowIsInactiveAndStateIsSubmitted()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString);
        fixture.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var body = Input(tour, "History", "history@example.com");
        var created = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", body, Guid.NewGuid());
        var id = created.Data.GetProperty("id").GetGuid();
        await using (var context = fixture.Context())
        {
            var row = await context.RosterRows.SingleAsync(r => r.RegistrationId == id);
            row.IsActive = false;
            context.Invitations.Add(new Invitation
            {
                Id = Guid.NewGuid(), RosterRowId = row.Id, AccessCodeHash = new byte[32],
                AccessCodeProtected = [1], AccessVersion = 1, CodeIssuedAt = DateTimeOffset.UtcNow,
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(1), RevokedAt = DateTimeOffset.UtcNow,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await context.SaveChangesAsync();
        }
        var details = await fixture.DataAsync($"/registrations/{id}");
        Assert.False(details.GetProperty("allowedActions").GetProperty("edit").GetProperty("allowed").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, (await fixture.SendAsync(HttpMethod.Put, $"/registrations/{id}",
            new { input = body, expectedRowVersion = Version(details) })).Status);
        Assert.Equal(HttpStatusCode.Conflict, (await fixture.SendAsync(HttpMethod.Post, $"/registrations/{id}/cancel",
            new { expectedRowVersion = Version(details), expectedTourRowVersion = Version(tour) })).Status);
        Assert.Equal(1, await fixture.Database.CountRowsAsync("dbo.Invitations"));
        await using var final = fixture.Context();
        Assert.Equal("SUBMITTED", (await final.GroupRegistrations.SingleAsync()).State);
    }

    [SchemaV11Fact]
    public async Task SaveFailure_RollsBackRegistrationRosterAndIdempotencyAuditTogether()
    {
        await using var fixture = await Fixture.CreateAsync();
        await fixture.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs ADD CONSTRAINT CK_TestAuditFailure CHECK (Action <> 'REGISTRATION_SUBMITTED');");
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString);
        fixture.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var key = Guid.NewGuid();
        var body = Input(tour, "Atomic", "atomic@example.com");
        var failure = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", body, key);
        Assert.Equal(HttpStatusCode.InternalServerError, failure.Status);
        Assert.DoesNotContain("CK_TestAuditFailure", failure.Body.GetRawText());
        Assert.Equal(0, await fixture.Database.CountRowsAsync("dbo.GroupRegistrations"));
        Assert.Equal(0, await fixture.Database.CountRowsAsync("dbo.RosterRows"));
        Assert.Equal(0, await fixture.Database.CountRowsAsync("dbo.AuditLogs"));
        await fixture.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs DROP CONSTRAINT CK_TestAuditFailure;");
        Assert.Equal(HttpStatusCode.OK, (await fixture.SendAsync(HttpMethod.Post,
            $"/tours/{fixture.TourId}/registrations", body, key)).Status);
        Assert.Equal(1, await fixture.Database.CountRowsAsync("dbo.GroupRegistrations"));
    }

    private static string Version(JsonElement data) => data.GetProperty("rowVersion").GetString()!;
    private static SmartCampus.Application.Features.Representative.Dtos.RegistrationInput Input(JsonElement tour, string group, string email, bool mixed = false, bool sharedOnly = false) =>
        new("School", group, "Contact", "contact@example.com", Version(tour), mixed ?
            [new(2, "INDIVIDUAL", "Same name", email.Trim(), null), new(4, "SHARED_VIEWING", "Same name", "room@example.com", "10A")]
            : [new(2, sharedOnly ? "SHARED_VIEWING" : "INDIVIDUAL", "Viewer", email.Trim(), null)]);
    private static async Task<string> LoginAsync(HttpClient client, string username)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password = "integration-test-password" });
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("accessToken").GetString()!;
    }
    private sealed record Response(HttpStatusCode Status, JsonElement Body)
    {
        public JsonElement Data => Body.TryGetProperty("data", out var data) ? data : default;
    }
    private sealed class Fixture(InitialAdminSeederTests.EmptySchemaDatabase database, Guid tourId, Guid adminId) : IAsyncDisposable
    {
        public InitialAdminSeederTests.EmptySchemaDatabase Database => database;
        public Guid TourId => tourId;
        public Guid AdminId => adminId;
        private HttpClient? client;
        private string? token;
        public void Bind(HttpClient httpClient, string? accessToken) { client = httpClient; token = accessToken; }
        public ApplicationDbContext Context() => new(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlServer(database.ConnectionString).Options);
        public static async Task<Fixture> CreateAsync()
        {
            var database = await InitialAdminSeederTests.EmptySchemaDatabase.CreateAsync();
            try
            {
                var admin = await database.InsertUserAsync(true, username: "rep.admin", roles: ["ADMIN"]);
                await database.InsertUserAsync(true, username: "rep.one", roles: ["SCHOOL_REPRESENTATIVE"]);
                await database.InsertUserAsync(true, username: "rep.two", roles: ["SCHOOL_REPRESENTATIVE"]);
                var tourId = Guid.NewGuid();
                var fixture = new Fixture(database, tourId, admin.Id);
                await using var context = fixture.Context();
                var now = DateTimeOffset.UtcNow;
                var poi = new Poi { Id = Guid.NewGuid(), Name = "Demo POI", MapKey = "demo", MapFrame = "map", CreatedAt = now, IsActive = true };
                var route = new SmartCampus.Domain.Entities.Route { Id = Guid.NewGuid(), Name = "Prepared route", MapKey = "demo", MapFrame = "map", EndMode = "LAST_POI", IsActive = true, CreatedAt = now };
                route.RouteStops.Add(new RouteStop { Id = Guid.NewGuid(), PoiId = poi.Id, StopOrder = 1, DwellSeconds = 30, HeadStepsJson = "[]" });
                context.Pois.Add(poi);
                context.Routes.Add(route);
                context.Tours.Add(new Tour { Id = tourId, Name = "Representative SQL Tour", RouteId = route.Id, ActiveRouteId = route.Id,
                    ScheduledStartAt = now.AddDays(10), State = "SCHEDULED", CreatedByUserId = admin.Id, CreatedAt = now });
                await context.SaveChangesAsync();
                return fixture;
            }
            catch { await database.DisposeAsync(); throw; }
        }
        public async Task<Response> SendAsync(HttpMethod method, string path, object? payload = null, Guid? key = null, string? token = null)
        {
            using var request = new HttpRequestMessage(method, "/api/representative" + path);
            var accessToken = token ?? this.token;
            if (accessToken is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            if (payload is not null) request.Content = JsonContent.Create(payload);
            if (key is not null) request.Headers.Add("Idempotency-Key", key.Value.ToString("D"));
            using var response = await client!.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            if (text.Length == 0) return new(response.StatusCode, default);
            using var document = JsonDocument.Parse(text);
            return new(response.StatusCode, document.RootElement.Clone());
        }
        public async Task<JsonElement> DataAsync(string path)
        {
            // Allow the initial Tour read before the main host binds; EF supplies identical DTO fields.
            if (client is null)
            {
                await using var context = Context();
                var tour = await context.Tours.SingleAsync(t => t.Id == TourId);
                return JsonSerializer.SerializeToElement(new { id = tour.Id, rowVersion = Convert.ToBase64String(tour.RowVersion) });
            }
            var response = await SendAsync(HttpMethod.Get, path);
            Assert.Equal(HttpStatusCode.OK, response.Status);
            return response.Data;
        }
        public ValueTask DisposeAsync() => database.DisposeAsync();
    }
}
