using System.Net;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;
using static SmartCampus.IntegrationTests.RepresentativeEndpointTests;

namespace SmartCampus.IntegrationTests;

public sealed class RegistrationReviewEndpointTests
{
    private static string Path(Guid id, string? action = null) => $"/api/admin/registrations/{id}" + (action is null ? "" : $"/{action}");
    private static object Decision(JsonElement detail, string? reason = null) => new
    {
        expectedRowVersion = Version(detail), expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(), reason
    };
    private static async Task<Guid> SubmitAsync(Fixture fixture, string email = "room@example.com", string group = "Shared group")
    {
        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var result = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations", Input(tour, group, email, sharedOnly: true), Guid.NewGuid());
        Assert.Equal(HttpStatusCode.OK, result.Status);
        return result.Data.GetProperty("id").GetGuid();
    }

    [SchemaV11Fact]
    public async Task SqlReviewLifecycle_IsVisibleToOwner_AndAuditsWithoutIssuingAccess()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        var rep = await LoginAsync(host.Client, "rep.one");
        var admin = await LoginAsync(host.Client, "rep.admin");
        f.Bind(host.Client, rep);
        var id = await SubmitAsync(f);
        var second = await SubmitAsync(f, "other@example.com", "Second group");
        var list = await f.SendAsync(HttpMethod.Get, "/api/admin/registrations?state=SUBMITTED&size=1", token: admin);
        Assert.Single(list.Data.EnumerateArray());
        Assert.Equal(2, list.Body.GetProperty("pagination").GetProperty("totalItems").GetInt32());
        Assert.Single((await f.SendAsync(HttpMethod.Get, "/api/admin/registrations?search=Second&sort=-submittedAt", token: admin)).Data.EnumerateArray());
        var detail = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
        Assert.True(detail.GetProperty("review").GetProperty("allowed").GetBoolean());
        Assert.Equal("SHARED_VIEWING", detail.GetProperty("roster")[0].GetProperty("rowType").GetString());
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, "reject"), Decision(detail, "  Sửa thông tin  "), token: admin)).Status);
        var owned = await f.DataAsync($"/registrations/{id}");
        Assert.Equal("REJECTED", owned.GetProperty("summary").GetProperty("state").GetString());
        Assert.Equal("Sửa thông tin", owned.GetProperty("rejectionReason").GetString());
        Assert.True(owned.GetProperty("allowedActions").GetProperty("resubmit").GetProperty("allowed").GetBoolean());
        var tour = await f.DataAsync($"/tours/{f.TourId}");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, $"/registrations/{id}/resubmit",
            new { input = Input(tour, "Shared group", "fixed@example.com", sharedOnly: true), expectedRowVersion = Version(owned) })).Status);
        detail = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("reviewedAt").ValueKind);
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(detail), token: admin)).Status);
        Assert.Equal(HttpStatusCode.Conflict, (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(detail), token: admin)).Status);
        owned = await f.DataAsync($"/registrations/{id}");
        Assert.Equal("APPROVED", owned.GetProperty("summary").GetProperty("state").GetString());
        Assert.False(owned.GetProperty("allowedActions").GetProperty("edit").GetProperty("allowed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, owned.GetProperty("rejectionReason").ValueKind);
        await using var db = f.Context();
        var registration = await db.GroupRegistrations.SingleAsync(r => r.Id == id);
        Assert.Equal(f.AdminId, registration.ReviewedByUserId);
        Assert.NotNull(registration.ReviewedAt);
        Assert.Equal("SCHEDULED", (await db.Tours.SingleAsync()).State);
        Assert.Empty(await db.Invitations.ToArrayAsync());
        Assert.Empty(await db.BrowserSessions.ToArrayAsync());
        var audits = await db.AuditLogs.Where(a => a.Action == "REGISTRATION_APPROVED" || a.Action == "REGISTRATION_REJECTED").ToArrayAsync();
        Assert.Equal(2, audits.Length);
        Assert.All(audits, a => { Assert.Equal(f.AdminId, a.ActorUserId); Assert.Equal(f.TourId, a.TourId); Assert.Equal(id.ToString("D"), a.EntityId); Assert.Null(a.DataJson); });
        Assert.NotEqual(id, second);
    }

    [SchemaV11Fact]
    public async Task AdminOnly_AllEndpoints_ValidateInputsAndDoNotWriteOnFailure()
    {
        await using var f = await Fixture.CreateAsync();
        await f.Database.InsertUserAsync(true, username: "review.staff", roles: ["STAFF"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await SubmitAsync(f);
        var repDetail = await f.DataAsync($"/registrations/{id}");
        var writes = Decision(repDetail, "Fix");
        foreach (var username in new[] { "rep.one", "rep.two", "review.staff" })
        {
            var token = await LoginAsync(host.Client, username);
            foreach (var path in new[] { "/api/admin/registrations", Path(id) })
                Assert.Equal(HttpStatusCode.Forbidden, (await f.SendAsync(HttpMethod.Get, path, token: token)).Status);
            foreach (var action in new[] { "approve", "reject" })
                Assert.Equal(HttpStatusCode.Forbidden, (await f.SendAsync(HttpMethod.Post, Path(id, action), writes, token: token)).Status);
        }
        f.Bind(host.Client, null);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.SendAsync(HttpMethod.Get, Path(id))).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), writes)).Status);
        var admin = await LoginAsync(host.Client, "rep.admin");
        foreach (var query in new[] { "page=0", "size=101", "state=BAD", "sort=--submittedAt", "expand=roster", "from=bad", "from=2026-10-10T00:00:00Z&to=2026-10-09T00:00:00Z" })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Get, "/api/admin/registrations?" + query, token: admin)).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Get, Path(Guid.NewGuid()), token: admin)).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Post, Path(Guid.NewGuid(), "approve"), Decision(repDetail), token: admin)).Status);
        foreach (var reason in new[] { "", "   ", new string('x', 1001) })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, Path(id, "reject"), Decision(repDetail, reason), token: admin)).Status);
        var injection = JsonSerializer.SerializeToNode(Decision(repDetail))!;
        injection["actorUserId"] = Guid.NewGuid().ToString("D");
        Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), injection, token: admin)).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), new { expectedRowVersion = "1", expectedTourRowVersion = "2" }, token: admin)).Status);
        Assert.Equal(1, await f.Database.CountRowsAsync("dbo.AuditLogs"));
        Assert.Equal("SUBMITTED", (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data.GetProperty("summary").GetProperty("state").GetString());
    }

    [SchemaV11Fact]
    public async Task ConcurrentDecisionsAndRepresentativeEdits_HaveOneWinner_NoDuplicateAudit()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        var detail = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
        var pair = await Task.WhenAll(f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(detail), token: admin),
            f.SendAsync(HttpMethod.Post, Path(id, "reject"), Decision(detail, "Fix"), token: admin));
        Assert.Equal(1, pair.Count(r => r.Status == HttpStatusCode.OK));
        Assert.Equal(1, pair.Count(r => r.Status == HttpStatusCode.Conflict));
        var editId = await SubmitAsync(f, "edit@example.com");
        var opened = (await f.SendAsync(HttpMethod.Get, Path(editId), token: admin)).Data;
        var tour = await f.DataAsync($"/tours/{f.TourId}");
        pair = await Task.WhenAll(f.SendAsync(HttpMethod.Post, Path(editId, "approve"), Decision(opened), token: admin),
            f.SendAsync(HttpMethod.Put, $"/registrations/{editId}", new { input = Input(tour, "Edited", "changed@example.com"), expectedRowVersion = Version(opened) }));
        Assert.Equal(1, pair.Count(r => r.Status == HttpStatusCode.OK));
        Assert.Equal(1, pair.Count(r => r.Status == HttpStatusCode.Conflict));
        var stale = await f.SendAsync(HttpMethod.Post, Path(editId, "approve"), Decision(opened), token: admin);
        Assert.Equal("STALE_VERSION", stale.Body.GetProperty("errors").GetProperty("code").GetString());
        await using var db = f.Context();
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.EntityId == id.ToString("D") && (a.Action == "REGISTRATION_APPROVED" || a.Action == "REGISTRATION_REJECTED")));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.EntityId == editId.ToString("D") && (a.Action == "REGISTRATION_APPROVED" || a.Action == "REGISTRATION_UPDATED")));
    }

    [SchemaV11Fact]
    public async Task ReviewRechecksTourAndAllTerminalRegistrationStates()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        var opened = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
        await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET ScheduledStartAt=DATEADD(hour,1,ScheduledStartAt) WHERE Id='{f.TourId}';");
        var stale = await f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(opened), token: admin);
        Assert.Equal("STALE_VERSION", stale.Body.GetProperty("errors").GetProperty("code").GetString());
        foreach (var state in new[] { "READY", "RUNNING", "COMPLETED", "CANCELLED" })
        {
            await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='{state}' WHERE Id='{f.TourId}';");
            var current = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
            Assert.False(current.GetProperty("review").GetProperty("allowed").GetBoolean());
            foreach (var action in new[] { "approve", "reject" })
                Assert.Equal("TOUR_LOCKED", (await f.SendAsync(HttpMethod.Post, Path(id, action), Decision(current, action == "reject" ? "Fix" : null), token: admin)).Body.GetProperty("errors").GetProperty("code").GetString());
        }
        await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='SCHEDULED' WHERE Id='{f.TourId}';");
        foreach (var state in new[] { "APPROVED", "REJECTED", "CANCELLED" })
        {
            await f.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='{state}' WHERE Id='{id}';");
            var current = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
            Assert.False(current.GetProperty("review").GetProperty("allowed").GetBoolean());
            Assert.Equal("STATE_CONFLICT", (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(current), token: admin)).Body.GetProperty("errors").GetProperty("code").GetString());
        }
        Assert.Equal(1, await f.Database.CountRowsAsync("dbo.AuditLogs"));
    }

    [SchemaV11Fact]
    public async Task ApprovalRevalidatesPersistedRosterAndEmailReservations_RejectStillAllowsCorrection()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        var other = await SubmitAsync(f, "taken@example.com");
        await f.Database.ExecuteAsync($"UPDATE dbo.RosterRows SET Email=' TAKEN@EXAMPLE.COM ' WHERE RegistrationId='{id}';");
        var current = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
        var conflict = await f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(current), token: admin);
        Assert.Equal("EMAIL_RESERVED", conflict.Body.GetProperty("errors").GetProperty("code").GetString());
        Assert.DoesNotContain("taken@example.com", conflict.Body.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal("SUBMITTED", (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data.GetProperty("summary").GetProperty("state").GetString());
        await f.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='REJECTED' WHERE Id='{other}'; UPDATE dbo.RosterRows SET RowType='BAD' WHERE RegistrationId='{id}';");
        Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(current), token: admin)).Status);
        await f.Database.ExecuteAsync($"UPDATE dbo.RosterRows SET IsActive=0 WHERE RegistrationId='{id}';");
        Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(current), token: admin)).Status);
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, "reject"), Decision(current, "Sửa roster"), token: admin)).Status);
    }

    [SchemaV11Fact]
    public async Task InvitationHistoryBlocksReview_EvenInactiveRevokedRows()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        await using (var db = f.Context())
        {
            var row = await db.RosterRows.SingleAsync(r => r.RegistrationId == id);
            row.IsActive = false;
            var now = DateTimeOffset.UtcNow;
            db.Invitations.Add(new Invitation { Id = Guid.NewGuid(), RosterRowId = row.Id, AccessCodeHash = new byte[32], AccessCodeProtected = [1], AccessVersion = 1,
                CodeIssuedAt = now, ExpiresAt = now.AddDays(1), RevokedAt = now, CreatedAt = now });
            await db.SaveChangesAsync();
        }
        var current = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
        Assert.False(current.GetProperty("review").GetProperty("allowed").GetBoolean());
        foreach (var action in new[] { "approve", "reject" })
            Assert.Equal("INVITATION_BOUNDARY", (await f.SendAsync(HttpMethod.Post, Path(id, action), Decision(current, action == "reject" ? "Fix" : null), token: admin)).Body.GetProperty("errors").GetProperty("code").GetString());
        Assert.Equal(1, await f.Database.CountRowsAsync("dbo.AuditLogs"));
    }

    [SchemaV11Fact]
    public async Task FailedAuditRollsBackDecisionAndVersions()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        var current = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs ADD CONSTRAINT CK_TestReviewAudit CHECK (Action NOT IN ('REGISTRATION_APPROVED','REGISTRATION_REJECTED'));");
        Assert.Equal(HttpStatusCode.InternalServerError, (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(current), token: admin)).Status);
        var after = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
        Assert.Equal("SUBMITTED", after.GetProperty("summary").GetProperty("state").GetString());
        Assert.Equal(Version(current), Version(after));
        Assert.Equal(JsonValueKind.Null, after.GetProperty("reviewedAt").ValueKind);
        Assert.Equal(1, await f.Database.CountRowsAsync("dbo.AuditLogs"));
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs DROP CONSTRAINT CK_TestReviewAudit;");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, "approve"), Decision(current), token: admin)).Status);
    }

    [SchemaV11Fact]
    public async Task DetailWaitsForTourWriter_AndReturnsMatchingVersionAndRoster()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        var original = (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Data;
        await using var sql = new SqlConnection(f.Database.ConnectionString);
        await sql.OpenAsync();
        await using var transaction = (SqlTransaction)await sql.BeginTransactionAsync();
        await using (var command = new SqlCommand($"SELECT Id FROM dbo.Tours WITH (UPDLOCK, ROWLOCK) WHERE Id='{f.TourId}';", sql, transaction))
            _ = await command.ExecuteScalarAsync();
        var adminRead = f.SendAsync(HttpMethod.Get, Path(id), token: admin);
        var representativeRead = f.SendAsync(HttpMethod.Get, $"/registrations/{id}");
        try
        {
            await Task.Delay(150);
            Assert.False(adminRead.IsCompleted);
            Assert.False(representativeRead.IsCompleted);
            await using var command = new SqlCommand($"UPDATE dbo.GroupRegistrations SET GroupName=N'New snapshot' WHERE Id='{id}'; UPDATE dbo.RosterRows SET DisplayName=N'New roster' WHERE RegistrationId='{id}';", sql, transaction);
            await command.ExecuteNonQueryAsync();
        }
        finally { await transaction.CommitAsync(); }
        foreach (var read in await Task.WhenAll(adminRead, representativeRead))
        {
            Assert.Equal(HttpStatusCode.OK, read.Status);
            Assert.Equal("New snapshot", read.Data.GetProperty("summary").GetProperty("groupName").GetString());
            Assert.Equal("New roster", read.Data.GetProperty("roster")[0].GetProperty("displayName").GetString());
            Assert.NotEqual(Version(original), Version(read.Data));
        }
    }
}
