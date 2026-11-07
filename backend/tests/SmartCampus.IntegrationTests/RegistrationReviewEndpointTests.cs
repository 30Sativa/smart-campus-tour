using System.Net;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Domain.Entities;
using static SmartCampus.IntegrationTests.RepresentativeEndpointTests;

namespace SmartCampus.IntegrationTests;

public sealed class RegistrationReviewEndpointTests
{
    private static string Path(Guid id, string? action = null) => $"/api/staff/manage/registrations/{id}" + (action is null ? "" : $"/{action}");
    private static string RowPath(Guid id, JsonElement detail, string action) =>
        $"{Path(id)}/rows/{detail.GetProperty("roster")[0].GetProperty("id").GetGuid()}/{action}";
    private static object Decision(JsonElement detail, string? reason = null) => new
    {
        requestId = Guid.NewGuid(), expectedRegistrationRowVersion = Version(detail),
        expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
        expectedRowVersion = Version(detail.GetProperty("roster")[0]), reason
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
        var staff = await LoginAsync(host.Client, "review.staff");
        f.Bind(host.Client, rep);
        var id = await SubmitAsync(f);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.two"));
        var second = await SubmitAsync(f, "other@example.com", "Second group");
        f.Bind(host.Client, rep);
        var list = await f.SendAsync(HttpMethod.Get, "/api/staff/manage/registrations?state=SUBMITTED&size=1", token: staff);
        Assert.Single(list.Data.EnumerateArray());
        Assert.Equal(2, list.Body.GetProperty("pagination").GetProperty("totalItems").GetInt32());
        Assert.Single((await f.SendAsync(HttpMethod.Get, "/api/staff/manage/registrations?search=Second&sort=-submittedAt", token: staff)).Data.EnumerateArray());
        var detail = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        Assert.True(detail.GetProperty("review").GetProperty("allowed").GetBoolean());
        Assert.Equal("SHARED_VIEWING", detail.GetProperty("roster")[0].GetProperty("rowType").GetString());
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, RowPath(id, detail, "reject"), Decision(detail, "  Sửa thông tin  "), token: staff)).Status);
        var owned = await f.DataAsync($"/registrations/{id}");
        Assert.Equal("REJECTED", owned.GetProperty("summary").GetProperty("state").GetString());
        Assert.Equal("Sửa thông tin", owned.GetProperty("rejectionReason").GetString());
        Assert.True(owned.GetProperty("allowedActions").GetProperty("resubmit").GetProperty("allowed").GetBoolean());
        var tour = await f.DataAsync($"/tours/{f.TourId}");
        var existingRowId = owned.GetProperty("roster")[0].GetProperty("id").GetGuid();
        var resubmitted = await f.SendAsync(HttpMethod.Post, $"/registrations/{id}/resubmit",
            new { input = Input(tour, "Shared group", "fixed@example.com", sharedOnly: true, rowIds: [existingRowId]), expectedRowVersion = Version(owned) });
        Assert.True(resubmitted.Status == HttpStatusCode.OK, resubmitted.Body.GetRawText());
        detail = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("reviewedAt").ValueKind);
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, RowPath(id, detail, "accept"), Decision(detail), token: staff)).Status);
        Assert.Equal(HttpStatusCode.Conflict, (await f.SendAsync(HttpMethod.Post, RowPath(id, detail, "accept"), Decision(detail), token: staff)).Status);
        owned = await f.DataAsync($"/registrations/{id}");
        Assert.Equal("APPROVED", owned.GetProperty("summary").GetProperty("state").GetString());
        Assert.True(owned.GetProperty("allowedActions").GetProperty("edit").GetProperty("allowed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, owned.GetProperty("rejectionReason").ValueKind);
        await using var db = f.Context();
        var registration = await db.GroupRegistrations.SingleAsync(r => r.Id == id);
        Assert.Equal(f.StaffId, registration.ReviewedByUserId);
        Assert.NotNull(registration.ReviewedAt);
        Assert.Equal("SCHEDULED", (await db.Tours.SingleAsync()).State);
        Assert.Empty(await db.Invitations.ToArrayAsync());
        Assert.Empty(await db.BrowserSessions.ToArrayAsync());
        var audits = await db.AuditLogs.Where(a => a.Action == "ROSTER_ROW_ACCEPTED" || a.Action == "ROSTER_ROW_REJECTED").ToArrayAsync();
        Assert.Equal(2, audits.Length);
        Assert.All(audits, a => { Assert.Equal(f.StaffId, a.ActorUserId); Assert.Equal(f.TourId, a.TourId); Assert.Equal("RosterRow", a.EntityType); Assert.NotNull(a.DataJson); });
        Assert.NotEqual(id, second);
    }

    [SchemaV11Fact]
    public async Task PendingQueue_KeepsApprovedGroupsWithPendingRows_ButNeverCancelledGroups()
    {
        await using var f = await Fixture.CreateAsync();
        await f.Database.InsertUserAsync(true, username: "rep.three", roles: ["SCHOOL_REPRESENTATIVE"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        var staff = await LoginAsync(host.Client, "review.staff");
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var tour = await f.DataAsync($"/tours/{f.TourId}");
        var mixed = await f.SendAsync(HttpMethod.Post, $"/tours/{f.TourId}/registrations", Input(tour, "Partly approved", "mixed@example.com", mixed: true), Guid.NewGuid());
        Assert.Equal(HttpStatusCode.OK, mixed.Status);
        var approved = mixed.Data.GetProperty("id").GetGuid();
        var detail = (await f.SendAsync(HttpMethod.Get, Path(approved), token: staff)).Data;
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, RowPath(approved, detail, "accept"), Decision(detail), token: staff)).Status);
        detail = (await f.SendAsync(HttpMethod.Get, Path(approved), token: staff)).Data;
        Assert.Equal("APPROVED", detail.GetProperty("summary").GetProperty("state").GetString());
        Assert.Equal(["ACCEPTED", "PENDING"], detail.GetProperty("roster").EnumerateArray().Select(row => row.GetProperty("participationState").GetString()));
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.two"));
        var cancelled = await SubmitAsync(f, "cancelled@example.com", "Cancelled group");
        // Tour-wide cancellation leaves the registration's active rows PENDING; only the registration state changes.
        await f.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='CANCELLED', CancelledAt=SYSDATETIMEOFFSET() WHERE Id='{cancelled}';");
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.three"));
        var submitted = await SubmitAsync(f, "submitted@example.com", "Submitted group");

        var seen = new List<Guid>();
        foreach (var page in new[] { 1, 2, 3 })
        {
            var list = await f.SendAsync(HttpMethod.Get, $"/api/staff/manage/registrations?state=SUBMITTED&size=1&page={page}", token: staff);
            Assert.Equal(HttpStatusCode.OK, list.Status);
            Assert.Equal(2, list.Body.GetProperty("pagination").GetProperty("totalItems").GetInt32());
            var items = list.Data.EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToArray();
            Assert.Equal(page <= 2 ? 1 : 0, items.Length);
            seen.AddRange(items);
        }
        Assert.Equal(new[] { approved, submitted }.Order(), seen.Order());
        Assert.DoesNotContain(cancelled, seen);
        var cancelledList = await f.SendAsync(HttpMethod.Get, "/api/staff/manage/registrations?state=CANCELLED", token: staff);
        Assert.Equal(cancelled, Assert.Single(cancelledList.Data.EnumerateArray()).GetProperty("id").GetGuid());

        // Once its last PENDING row is decided, the APPROVED group leaves the queue.
        var pendingRow = detail.GetProperty("roster")[1];
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, $"{Path(approved)}/rows/{pendingRow.GetProperty("id").GetGuid()}/reject", new
        {
            requestId = Guid.NewGuid(), expectedRegistrationRowVersion = Version(detail),
            expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
            expectedRowVersion = Version(pendingRow), reason = "Not needed"
        }, token: staff)).Status);
        var remaining = await f.SendAsync(HttpMethod.Get, "/api/staff/manage/registrations?state=SUBMITTED", token: staff);
        Assert.Equal(submitted, Assert.Single(remaining.Data.EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal(1, remaining.Body.GetProperty("pagination").GetProperty("totalItems").GetInt32());
    }

    [SchemaV11Fact]
    public async Task StaffOnly_AllEndpoints_ValidateInputsAndDoNotWriteOnFailure()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await SubmitAsync(f);
        var repDetail = await f.DataAsync($"/registrations/{id}");
        var writes = Decision(repDetail, "Fix");
        foreach (var username in new[] { "rep.one", "rep.two", "rep.admin" })
        {
            var token = await LoginAsync(host.Client, username);
            foreach (var path in new[] { "/api/staff/manage/registrations", Path(id) })
                Assert.Equal(HttpStatusCode.Forbidden, (await f.SendAsync(HttpMethod.Get, path, token: token)).Status);
            foreach (var action in new[] { "accept", "reject" })
                Assert.Equal(HttpStatusCode.Forbidden, (await f.SendAsync(HttpMethod.Post, RowPath(id, repDetail, action), writes, token: token)).Status);
        }
        f.Bind(host.Client, null);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.SendAsync(HttpMethod.Get, Path(id))).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.SendAsync(HttpMethod.Post, RowPath(id, repDetail, "accept"), writes)).Status);
        var staff = await LoginAsync(host.Client, "review.staff");
        foreach (var query in new[] { "page=0", "size=101", "state=BAD", "sort=--submittedAt", "expand=roster", "from=bad", "from=2026-10-10T00:00:00Z&to=2026-10-09T00:00:00Z" })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Get, "/api/staff/manage/registrations?" + query, token: staff)).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Get, Path(Guid.NewGuid()), token: staff)).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Post, RowPath(Guid.NewGuid(), repDetail, "accept"), Decision(repDetail), token: staff)).Status);
        foreach (var reason in new[] { "", "   ", new string('x', 1001) })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, RowPath(id, repDetail, "reject"), Decision(repDetail, reason), token: staff)).Status);
        var invalidRequestId = JsonSerializer.SerializeToNode(Decision(repDetail))!;
        invalidRequestId["requestId"] = Guid.Empty.ToString("D");
        Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, RowPath(id, repDetail, "accept"), invalidRequestId, token: staff)).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, RowPath(id, repDetail, "accept"), new { expectedRegistrationRowVersion = "1", expectedRowVersion = "2", expectedTourRowVersion = "3", requestId = Guid.NewGuid() }, token: staff)).Status);
        Assert.Equal(1, await f.Database.CountRowsAsync("dbo.AuditLogs"));
        Assert.Equal("SUBMITTED", (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data.GetProperty("summary").GetProperty("state").GetString());
    }

    [SchemaV11Fact]
    public async Task ConcurrentDecisionsAndRepresentativeEdits_HaveOneWinner_NoDuplicateAudit()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var staff = await LoginAsync(host.Client, "review.staff");
        var id = await SubmitAsync(f);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.two"));
        var detail = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        var pair = await Task.WhenAll(f.SendAsync(HttpMethod.Post, RowPath(id, detail, "accept"), Decision(detail), token: staff),
            f.SendAsync(HttpMethod.Post, RowPath(id, detail, "reject"), Decision(detail, "Fix"), token: staff));
        Assert.Equal(1, pair.Count(r => r.Status == HttpStatusCode.OK));
        Assert.Equal(1, pair.Count(r => r.Status == HttpStatusCode.Conflict));
        var editId = await SubmitAsync(f, "edit@example.com");
        var opened = (await f.SendAsync(HttpMethod.Get, Path(editId), token: staff)).Data;
        var tour = await f.DataAsync($"/tours/{f.TourId}");
        pair = await Task.WhenAll(f.SendAsync(HttpMethod.Post, RowPath(editId, opened, "accept"), Decision(opened), token: staff),
            f.SendAsync(HttpMethod.Put, $"/registrations/{editId}", new { input = Input(tour, "Edited", "changed@example.com"), expectedRowVersion = Version(opened) }));
        Assert.Equal(1, pair.Count(r => r.Status == HttpStatusCode.OK));
        Assert.Equal(1, pair.Count(r => r.Status == HttpStatusCode.Conflict));
        var stale = await f.SendAsync(HttpMethod.Post, RowPath(editId, opened, "accept"), Decision(opened), token: staff);
        Assert.Equal("STALE_VERSION", stale.Body.GetProperty("errors").GetProperty("code").GetString());
        await using var db = f.Context();
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.EntityId == detail.GetProperty("roster")[0].GetProperty("id").GetGuid().ToString("D") &&
            (a.Action == "ROSTER_ROW_ACCEPTED" || a.Action == "ROSTER_ROW_REJECTED")));
        // Either request may win. An edit is audited on the registration and an accept on the row; the loser writes nothing.
        var editWon = pair[1].Status == HttpStatusCode.OK;
        var openedRowId = opened.GetProperty("roster")[0].GetProperty("id").GetGuid().ToString("D");
        var editedRegistrationId = editId.ToString("D");
        Assert.Equal(editWon ? 0 : 1, await db.AuditLogs.CountAsync(a => a.EntityId == openedRowId && a.Action == "ROSTER_ROW_ACCEPTED"));
        Assert.Equal(editWon ? 1 : 0, await db.AuditLogs.CountAsync(a => a.EntityId == editedRegistrationId && a.Action == "REGISTRATION_UPDATED"));
    }

    [SchemaV11Fact]
    public async Task ReviewRechecksTourAndPendingRowState()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var staff = await LoginAsync(host.Client, "review.staff");
        var id = await SubmitAsync(f);
        var opened = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET ScheduledStartAt=DATEADD(hour,1,ScheduledStartAt) WHERE Id='{f.TourId}';");
        var stale = await f.SendAsync(HttpMethod.Post, RowPath(id, opened, "accept"), Decision(opened), token: staff);
        Assert.Equal("STALE_VERSION", stale.Body.GetProperty("errors").GetProperty("code").GetString());
        foreach (var state in new[] { "READY", "RUNNING", "COMPLETED", "CANCELLED" })
        {
            await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='{state}' WHERE Id='{f.TourId}';");
            var terminalTourDetail = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
            Assert.False(terminalTourDetail.GetProperty("review").GetProperty("allowed").GetBoolean());
            foreach (var action in new[] { "accept", "reject" })
                Assert.Equal("TOUR_LOCKED", (await f.SendAsync(HttpMethod.Post, RowPath(id, terminalTourDetail, action), Decision(terminalTourDetail, action == "reject" ? "Fix" : null), token: staff)).Body.GetProperty("errors").GetProperty("code").GetString());
        }
        await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='SCHEDULED' WHERE Id='{f.TourId}';");
        var reopened = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        var accepted = await f.SendAsync(HttpMethod.Post, RowPath(id, reopened, "accept"), Decision(reopened), token: staff);
        Assert.Equal(HttpStatusCode.OK, accepted.Status);
        var current = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        Assert.Equal("ACCEPTED", current.GetProperty("roster")[0].GetProperty("participationState").GetString());
        foreach (var action in new[] { "accept", "reject" })
            Assert.Equal("ROW_STATE_CONFLICT", (await f.SendAsync(HttpMethod.Post,
                RowPath(id, current, action), Decision(current, action == "reject" ? "Already reviewed" : null), token: staff))
                .Body.GetProperty("errors").GetProperty("code").GetString());
        await using var db = f.Context();
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "ROSTER_ROW_ACCEPTED"));
    }

    [SchemaV11Fact]
    public async Task ApprovalRevalidatesPersistedRosterAndEmailReservations_RejectStillAllowsCorrection()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var staff = await LoginAsync(host.Client, "review.staff");
        var id = await SubmitAsync(f);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.two"));
        await SubmitAsync(f, "taken@example.com");
        await f.Database.ExecuteAsync($"UPDATE dbo.RosterRows SET Email=' TAKEN@EXAMPLE.COM ' WHERE RegistrationId='{id}';");
        var current = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        var conflict = await f.SendAsync(HttpMethod.Post, RowPath(id, current, "accept"), Decision(current), token: staff);
        Assert.Equal("EMAIL_RESERVED", conflict.Body.GetProperty("errors").GetProperty("code").GetString());
        Assert.DoesNotContain("taken@example.com", conflict.Body.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal("SUBMITTED", (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data.GetProperty("summary").GetProperty("state").GetString());
        await f.Database.ExecuteAsync($"UPDATE dbo.RosterRows SET RowType='BAD', Email='free@example.com' WHERE RegistrationId='{id}';");
        current = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        var invalidRoster = await f.SendAsync(HttpMethod.Post, RowPath(id, current, "accept"), Decision(current), token: staff);
        Assert.True(invalidRoster.Status == HttpStatusCode.BadRequest, invalidRoster.Body.GetRawText());
        var row = current.GetProperty("roster")[0];
        var rejected = await f.SendAsync(HttpMethod.Post,
            $"{Path(id)}/rows/{row.GetProperty("id").GetGuid()}/reject", new
            {
                requestId = Guid.NewGuid(), expectedRegistrationRowVersion = Version(current),
                expectedTourRowVersion = current.GetProperty("tourRowVersion").GetString(),
                expectedRowVersion = Version(row), reason = "Sửa roster"
            }, token: staff);
        Assert.Equal(HttpStatusCode.OK, rejected.Status);
    }

    [SchemaV11Fact]
    public async Task InactiveRowWithInvitationHistoryCannotBeReviewed()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var staff = await LoginAsync(host.Client, "review.staff");
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
        Guid rowId;
        string rowVersion;
        await using (var db = f.Context())
        {
            var row = await db.RosterRows.SingleAsync(r => r.RegistrationId == id);
            rowId = row.Id;
            rowVersion = Convert.ToBase64String(row.RowVersion);
        }
        var current = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        var denied = await f.SendAsync(HttpMethod.Post, $"{Path(id)}/rows/{rowId}/accept", new
        {
            requestId = Guid.NewGuid(), expectedRegistrationRowVersion = Version(current),
            expectedTourRowVersion = current.GetProperty("tourRowVersion").GetString(), expectedRowVersion = rowVersion
        }, token: staff);
        Assert.Equal(HttpStatusCode.NotFound, denied.Status);
        await using var verify = f.Context();
        Assert.True((await verify.Invitations.SingleAsync()).RevokedAt.HasValue);
        Assert.Equal(1, await f.Database.CountRowsAsync("dbo.AuditLogs"));
    }

    [SchemaV11Fact]
    public async Task FailedAuditRollsBackDecisionAndVersions()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var staff = await LoginAsync(host.Client, "review.staff");
        var id = await SubmitAsync(f);
        var current = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs ADD CONSTRAINT CK_TestReviewAudit CHECK (Action NOT IN ('ROSTER_ROW_ACCEPTED','ROSTER_ROW_REJECTED'));");
        Assert.Equal(HttpStatusCode.InternalServerError, (await f.SendAsync(HttpMethod.Post, RowPath(id, current, "accept"), Decision(current), token: staff)).Status);
        var after = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        Assert.Equal("SUBMITTED", after.GetProperty("summary").GetProperty("state").GetString());
        Assert.Equal(Version(current), Version(after));
        Assert.Equal(JsonValueKind.Null, after.GetProperty("reviewedAt").ValueKind);
        Assert.Equal(1, await f.Database.CountRowsAsync("dbo.AuditLogs"));
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs DROP CONSTRAINT CK_TestReviewAudit;");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, RowPath(id, current, "accept"), Decision(current), token: staff)).Status);
        Assert.Equal(2, await f.Database.CountRowsAsync("dbo.AuditLogs"));
    }

    [SchemaV11Fact]
    public async Task DetailWaitsForTourWriter_AndReturnsMatchingVersionAndRoster()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var staff = await LoginAsync(host.Client, "review.staff");
        var id = await SubmitAsync(f);
        var original = (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Data;
        await using var sql = new SqlConnection(f.Database.ConnectionString);
        await sql.OpenAsync();
        await using var transaction = (SqlTransaction)await sql.BeginTransactionAsync();
        await using (var command = new SqlCommand($"SELECT Id FROM dbo.Tours WITH (UPDLOCK, ROWLOCK) WHERE Id='{f.TourId}';", sql, transaction))
            _ = await command.ExecuteScalarAsync();
        var adminRead = f.SendAsync(HttpMethod.Get, Path(id), token: staff);
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
