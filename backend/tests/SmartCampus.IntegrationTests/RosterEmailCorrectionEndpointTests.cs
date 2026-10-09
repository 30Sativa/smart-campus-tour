using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application;
using SmartCampus.Application.Features.Invitations.Commands.DeliverEmail;
using SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Integrations.Invitations;
using static SmartCampus.IntegrationTests.RepresentativeEndpointTests;

namespace SmartCampus.IntegrationTests;

public sealed class RosterEmailCorrectionEndpointTests
{
    private static string Detail(Guid id) => $"/api/admin/registrations/{id}";
    private static string Path(Guid id, Guid row) => $"{Detail(id)}/roster/{row}/email";
    private static string Support(Guid id) => $"/api/registrations/{id}/invitations";
    private static IReadOnlyDictionary<string, string> Settings() => InvitationPrimitiveTests.ConfigurationValues()
        .ToDictionary(p => p.Key.Replace(":", "__"), p => p.Value);
    private static CorrectRosterEmailRequest Write(JsonElement detail, string email = "fixed@example.test", Guid? requestId = null, int index = 0)
    {
        var row = detail.GetProperty("roster")[index];
        return new(requestId ?? Guid.NewGuid(), email, Version(detail), detail.GetProperty("tourRowVersion").GetString()!,
            Version(row), row.GetProperty("invitationRowVersion").GetString());
    }
    private static Guid RowId(JsonElement detail, int index = 0) => detail.GetProperty("roster")[index].GetProperty("id").GetGuid();
    private static async Task<Guid> SubmitAsync(Fixture f, string email = "viewer@example.test", bool mixed = true)
    {
        var result = await f.SendAsync(HttpMethod.Post, $"/tours/{f.TourId}/registrations",
            Input(await f.DataAsync($"/tours/{f.TourId}"), "Group", email, mixed: mixed), Guid.NewGuid());
        Assert.Equal(HttpStatusCode.OK, result.Status);
        return result.Data.GetProperty("id").GetGuid();
    }
    private static async Task ApproveAsync(Fixture f, Guid id, string admin)
    {
        var detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Detail(id) + "/approve", new {
            expectedRowVersion = Version(detail), expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString() }, token: admin)).Status);
    }
    private static async Task<string> CodeAsync(Fixture f, Guid invitation)
    {
        await using var db = f.Context();
        var entity = await db.Invitations.SingleAsync(i => i.Id == invitation);
        return new InvitationCodeService(InvitationPrimitiveTests.Configuration()).Reveal(entity.Id, entity.AccessVersion, entity.AccessCodeProtected);
    }
    private static async Task<(HttpStatusCode Status, string? Cookie)> AccessAsync(HttpClient client, Guid tour, string action, string? code = null, string? cookie = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/student/tours/{tour}/{action}");
        if (code is not null) request.Content = JsonContent.Create(new { accessCode = code });
        if (cookie is not null) request.Headers.Add("Cookie", cookie);
        using var response = await client.SendAsync(request);
        return (response.StatusCode, response.Headers.TryGetValues("Set-Cookie", out var cookies) ? cookies.First().Split(';')[0] : null);
    }
    private static void Conflict(Response response, string code)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.Status);
        Assert.Equal(code, response.Body.GetProperty("errors").GetProperty("code").GetString());
    }

    [SchemaV11Fact]
    public async Task ApprovedCorrection_RetainsIdentityApprovalAndExpiry_RevokesOnlySelectedAccess_AndReplaysAfterRestart()
    {
        await using var f = await Fixture.CreateAsync();
        var id = Guid.Empty;
        JsonElement detail = default;
        CorrectRosterEmailRequest? write = null;
        Guid rowId = default;
        await using (var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings()))
        {
            f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
            var admin = await LoginAsync(host.Client, "rep.admin");
            id = await SubmitAsync(f);
            await ApproveAsync(f, id, admin);
            detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
            rowId = RowId(detail, 1); // Correct the shared-viewing row.
            var items = (await f.SendAsync(HttpMethod.Get, Support(id))).Data.GetProperty("items");
            var otherId = items[0].GetProperty("id").GetGuid();
            var targetId = items[1].GetProperty("id").GetGuid();
            var oldCode = await CodeAsync(f, targetId);
            var targetJoin = await AccessAsync(host.Client, f.TourId, "join", oldCode);
            var otherJoin = await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, otherId));
            Assert.Equal(HttpStatusCode.OK, targetJoin.Status);
            Assert.Equal(HttpStatusCode.OK, otherJoin.Status);
            write = Write(detail, "  FIXED@EXAMPLE.TEST  ", index: 1);
            var corrections = await Task.WhenAll(f.SendAsync(HttpMethod.Post, Path(id, rowId), write, token: admin),
                f.SendAsync(HttpMethod.Post, Path(id, rowId), write, token: admin));
            Assert.All(corrections, result => Assert.Equal(HttpStatusCode.OK, result.Status));
            Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "join", oldCode)).Status);
            Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "session", cookie: targetJoin.Cookie)).Status);
            Assert.Equal(HttpStatusCode.OK, (await AccessAsync(host.Client, f.TourId, "session", cookie: otherJoin.Cookie)).Status);
            Assert.Equal(HttpStatusCode.OK, (await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, targetId))).Status);
            var after = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
            Assert.Equal("APPROVED", after.GetProperty("summary").GetProperty("state").GetString());
            Assert.Equal(detail.GetProperty("reviewedAt").GetRawText(), after.GetProperty("reviewedAt").GetRawText());
            Assert.Equal(detail.GetProperty("reviewedByUserId").GetRawText(), after.GetProperty("reviewedByUserId").GetRawText());
            Assert.Equal(detail.GetProperty("roster")[0].GetRawText(), after.GetProperty("roster")[0].GetRawText());
            Assert.Equal(rowId, RowId(after, 1));
            Assert.Equal("fixed@example.test", after.GetProperty("roster")[1].GetProperty("email").GetString());
            await using var db = f.Context();
            var target = await db.Invitations.SingleAsync(i => i.Id == targetId);
            Assert.Equal(2, target.AccessVersion);
            Assert.Equal(items[1].GetProperty("expiresAt").GetDateTimeOffset(), target.ExpiresAt);
            Assert.Equal(2, await db.Invitations.CountAsync());
            Assert.Equal(3, await db.AuditLogs.CountAsync(a => a.Action == "EMAIL_SEND_REQUESTED"));
            var audit = await db.AuditLogs.SingleAsync(a => a.Action == CorrectRosterEmailCommandHandler.AuditAction);
            Assert.Equal(f.AdminId, audit.ActorUserId);
            Assert.Equal(rowId.ToString("D"), audit.EntityId);
            Assert.Equal("RosterRow", audit.EntityType);
            Assert.Equal(f.TourId, audit.TourId);
            Assert.Equal(write.RequestId, audit.CorrelationId);
            Assert.DoesNotContain("@", audit.DataJson!);
            Assert.DoesNotContain(oldCode, audit.DataJson!);
        }
        await using var restarted = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(restarted.Client, await LoginAsync(restarted.Client, "rep.admin"));
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, rowId), write!)).Status);
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, rowId), write! with { Email = "different@example.test" }), "IDEMPOTENCY_CONFLICT");
        await using var final = f.Context();
        Assert.Equal(1, await final.AuditLogs.CountAsync(a => a.Action == CorrectRosterEmailCommandHandler.AuditAction));
        Assert.Equal(3, await final.AuditLogs.CountAsync(a => a.Action == "EMAIL_SEND_REQUESTED"));
        var current = (await f.SendAsync(HttpMethod.Get, Detail(id))).Data;
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, rowId), Write(current, "later@example.test", index: 1))).Status);
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, rowId), write!), "IDEMPOTENCY_CONFLICT");
        // Reusing the earlier UUID with the later recipient must not masquerade as the original request.
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, rowId), write! with { Email = "later@example.test" }), "IDEMPOTENCY_CONFLICT");
        Assert.Equal(4, await final.AuditLogs.CountAsync(a => a.Action == "EMAIL_SEND_REQUESTED"));
        current = (await f.SendAsync(HttpMethod.Get, Detail(id))).Data;
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, rowId), Write(current, "fixed@example.test", index: 1))).Status);
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, rowId), write!), "IDEMPOTENCY_CONFLICT");
        Assert.Equal(5, await final.AuditLogs.CountAsync(a => a.Action == "EMAIL_SEND_REQUESTED"));
    }

    [SchemaV11Fact]
    public async Task UnapprovedCorrection_PreservesSubmittedOrRejected_WithoutInvitations_AndKeepsRepresentativeFlow()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        foreach (var state in new[] { "SUBMITTED", "REJECTED" })
        {
            var before = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
            if (state == "REJECTED")
            {
                Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Detail(id) + "/reject", new {
                    expectedRowVersion = Version(before), expectedTourRowVersion = before.GetProperty("tourRowVersion").GetString(), reason = "Fix email" }, token: admin)).Status);
                before = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
            }
            var row = RowId(before);
            Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, row), Write(before, state.ToLowerInvariant() + "@example.test"), token: admin)).Status);
            var after = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
            Assert.Equal(state, after.GetProperty("summary").GetProperty("state").GetString());
            Assert.Equal(before.GetProperty("rejectionReason").GetRawText(), after.GetProperty("rejectionReason").GetRawText());
            Assert.Equal(before.GetProperty("reviewedAt").GetRawText(), after.GetProperty("reviewedAt").GetRawText());
            Assert.NotEqual(Version(before), Version(after));
            Assert.NotEqual(Version(before.GetProperty("roster")[0]), Version(after.GetProperty("roster")[0]));
            Assert.Equal(before.GetProperty("roster")[1].GetRawText(), after.GetProperty("roster")[1].GetRawText());
        }
        await using (var db = f.Context()) { Assert.Empty(await db.Invitations.ToArrayAsync()); Assert.Empty(await db.BrowserSessions.ToArrayAsync()); }
        var owned = await f.DataAsync($"/registrations/{id}");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, $"/registrations/{id}/resubmit", new {
            input = Input(await f.DataAsync($"/tours/{f.TourId}"), "Group", "rejected@example.test", mixed: true), expectedRowVersion = Version(owned) })).Status);
        await ApproveAsync(f, id, admin);
    }

    [SchemaV11Fact]
    public async Task AuthorizationAndInputValidation_RejectUnexpectedAttributes_AndWrongOrInactiveRows()
    {
        await using var f = await Fixture.CreateAsync();
        await f.Database.InsertUserAsync(true, username: "correction.staff", roles: ["STAFF"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        var detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        var row = RowId(detail);
        var write = Write(detail);
        foreach (var user in new[] { "rep.one", "rep.two", "correction.staff" })
            Assert.Equal(HttpStatusCode.Forbidden, (await f.SendAsync(HttpMethod.Post, Path(id, row), write, token: await LoginAsync(host.Client, user))).Status);
        f.Bind(host.Client, null);
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.SendAsync(HttpMethod.Post, Path(id, row), write)).Status);
        foreach (var invalid in new[] { write with { Email = "" }, write with { Email = "bad" }, write with { Email = "a b@example.test" },
            write with { Email = new string('x', 255) + "@example.test" }, write with { RequestId = Guid.Empty },
            write with { ExpectedRowVersion = "bad" }, write with { ExpectedTourRowVersion = "bad" },
            write with { ExpectedRosterRowVersion = "bad" }, write with { ExpectedInvitationRowVersion = "bad" } })
            Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, Path(id, row), invalid, token: admin)).Status);
        var injected = JsonSerializer.SerializeToNode(write, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        injected["displayName"] = "Changed";
        Assert.Equal(HttpStatusCode.BadRequest, (await f.SendAsync(HttpMethod.Post, Path(id, row), injected, token: admin)).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Post, Path(id, Guid.NewGuid()), write, token: admin)).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Post, Path(Guid.NewGuid(), row), write, token: admin)).Status);
        await f.Database.ExecuteAsync($"UPDATE dbo.RosterRows SET IsActive=0 WHERE Id='{row}';");
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Post, Path(id, row), write, token: admin)).Status);
        Assert.Equal(1, await f.Database.CountRowsAsync("dbo.AuditLogs"));
    }

    [SchemaV11Fact]
    public async Task Gates_RejectLockedToursCancelledRegistrationDisabledApprovedAndInvitationHistory()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        foreach (var state in new[] { "READY", "RUNNING", "COMPLETED", "CANCELLED" })
        {
            await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='{state}' WHERE Id='{f.TourId}';");
            var detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
            Assert.False(detail.GetProperty("correctEmail").GetProperty("allowed").GetBoolean());
            Conflict(await f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), Write(detail), token: admin), "TOUR_LOCKED");
        }
        await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='SCHEDULED' WHERE Id='{f.TourId}'; UPDATE dbo.GroupRegistrations SET State='CANCELLED' WHERE Id='{id}';");
        var current = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, RowId(current)), Write(current), token: admin), "STATE_CONFLICT");
        await f.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='SUBMITTED' WHERE Id='{id}';");
        await ApproveAsync(f, id, admin);
        current = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, RowId(current)), Write(current), token: admin), "INVITATIONS_DISABLED");
        await using (var enabled = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings()))
        {
            f.Bind(enabled.Client, await LoginAsync(enabled.Client, "rep.admin"));
            current = (await f.SendAsync(HttpMethod.Get, Detail(id))).Data;
            Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, RowId(current)), Write(current))).Status);
            await using var db = f.Context();
            Assert.Equal(1, await db.Invitations.CountAsync()); // Missing invitations: issue only the corrected row.
        }
        f.Bind(host.Client, admin);
        await f.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='REJECTED' WHERE Id='{id}';");
        current = (await f.SendAsync(HttpMethod.Get, Detail(id))).Data;
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, RowId(current)), Write(current, "later@example.test")), "INVITATION_BOUNDARY");
    }

    [SchemaV11Fact]
    public async Task EmailUniqueness_UsesNormalizationAcrossOwnRosterAndReservedGroups_AndReleasesOldEmail()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        var other = await SubmitAsync(f, "reserved@example.test", mixed: false);
        var current = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        var row = RowId(current);
        foreach (var email in new[] { " ROOM@EXAMPLE.COM ", " RESERVED@EXAMPLE.TEST " })
        {
            var response = await f.SendAsync(HttpMethod.Post, Path(id, row), Write(current, email), token: admin);
            Conflict(response, "EMAIL_RESERVED");
            Assert.DoesNotContain("reserved@example.test", response.Body.GetRawText());
        }
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, row), Write(current, " VIEWER@EXAMPLE.TEST "), token: admin), "EMAIL_UNCHANGED");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, row), Write(current), token: admin)).Status);
        var oldEmailGroup = await SubmitAsync(f, "viewer@example.test", mixed: false);
        Assert.NotEqual(id, oldEmailGroup);
        await f.Database.ExecuteAsync($"UPDATE dbo.GroupRegistrations SET State='REJECTED' WHERE Id='{other}';");
        current = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, row), Write(current, "reserved@example.test"), token: admin)).Status);
        var third = await SubmitAsync(f, "third@example.test", mixed: false);
        var otherDetail = (await f.SendAsync(HttpMethod.Get, Detail(third), token: admin)).Data;
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Post, Path(id, RowId(otherDetail)), Write(current), token: admin)).Status);
    }

    [SchemaV11Fact]
    public async Task CompetingCorrectionsAndApproval_HaveOneWinner_AndEachSnapshotVersionIsChecked()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        var detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        var write = Write(detail);
        var pair = await Task.WhenAll(f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), write, token: admin),
            f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), write with { RequestId = Guid.NewGuid(), Email = "second@example.test" }, token: admin));
        Assert.Single(pair, p => p.Status == HttpStatusCode.OK);
        Conflict(Assert.Single(pair, p => p.Status == HttpStatusCode.Conflict), "STALE_VERSION");
        detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        pair = await Task.WhenAll(f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), Write(detail, "race@example.test"), token: admin),
            f.SendAsync(HttpMethod.Post, Detail(id) + "/approve", new { expectedRowVersion = Version(detail), expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString() }, token: admin));
        Assert.Single(pair, p => p.Status == HttpStatusCode.OK);
        Conflict(Assert.Single(pair, p => p.Status == HttpStatusCode.Conflict), "STALE_VERSION");
        const string stale = "AAAAAAAAAAE=";
        detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        write = Write(detail, "stale@example.test");
        foreach (var invalid in new[] { write with { ExpectedTourRowVersion = stale }, write with { ExpectedRowVersion = stale }, write with { ExpectedRosterRowVersion = stale } })
            Conflict(await f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), invalid, token: admin), "STALE_VERSION");
    }

    [SchemaV11Fact]
    public async Task CompetingGroupsCannotReserveSameEmail_AndRepresentativeReplacementCannotOverwriteCorrection()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var first = await SubmitAsync(f, "first@example.test", mixed: false);
        var second = await SubmitAsync(f, "second@example.test", mixed: false);
        var a = (await f.SendAsync(HttpMethod.Get, Detail(first), token: admin)).Data;
        var b = (await f.SendAsync(HttpMethod.Get, Detail(second), token: admin)).Data;
        var pair = await Task.WhenAll(f.SendAsync(HttpMethod.Post, Path(first, RowId(a)), Write(a, "winner@example.test"), token: admin),
            f.SendAsync(HttpMethod.Post, Path(second, RowId(b)), Write(b, " WINNER@EXAMPLE.TEST "), token: admin));
        Assert.Single(pair, p => p.Status == HttpStatusCode.OK);
        Conflict(Assert.Single(pair, p => p.Status == HttpStatusCode.Conflict), "EMAIL_RESERVED");
        a = (await f.SendAsync(HttpMethod.Get, Detail(first), token: admin)).Data;
        pair = await Task.WhenAll(f.SendAsync(HttpMethod.Post, Path(first, RowId(a)), Write(a, "admin-edit@example.test"), token: admin),
            f.SendAsync(HttpMethod.Put, $"/registrations/{first}", new { input = Input(await f.DataAsync($"/tours/{f.TourId}"), "Group", "rep-edit@example.test"), expectedRowVersion = Version(a) }));
        Assert.Single(pair, p => p.Status == HttpStatusCode.OK);
        Conflict(Assert.Single(pair, p => p.Status == HttpStatusCode.Conflict), "STALE_VERSION");
    }

    [SchemaV11Fact]
    public async Task AuditFailure_RollsBackEmailVersionsCodeSessionsAndQueuedEmail_AndSameRequestCanRetry()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        await ApproveAsync(f, id, admin);
        var detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        var items = (await f.SendAsync(HttpMethod.Get, Support(id))).Data.GetProperty("items");
        var invitation = items[0].GetProperty("id").GetGuid();
        var oldCode = await CodeAsync(f, invitation);
        var joined = await AccessAsync(host.Client, f.TourId, "join", oldCode);
        var write = Write(detail);
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs ADD CONSTRAINT CK_TestCorrectionAudit CHECK (Action <> 'ROSTER_EMAIL_CORRECTED');");
        Assert.Equal(HttpStatusCode.InternalServerError, (await f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), write, token: admin)).Status);
        var after = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        Assert.Equal(detail.GetRawText(), after.GetRawText());
        Assert.Equal(oldCode, await CodeAsync(f, invitation));
        Assert.Equal(HttpStatusCode.OK, (await AccessAsync(host.Client, f.TourId, "session", cookie: joined.Cookie)).Status);
        await using (var db = f.Context())
        {
            Assert.Equal(2, await db.AuditLogs.CountAsync(a => a.Action == "EMAIL_SEND_REQUESTED"));
            Assert.Equal(0, await db.AuditLogs.CountAsync(a => a.Action == CorrectRosterEmailCommandHandler.AuditAction));
        }
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs DROP CONSTRAINT CK_TestCorrectionAudit;");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), write, token: admin)).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "session", cookie: joined.Cookie)).Status);
    }

    [SchemaV11Fact]
    public async Task DeliveryFailureAndRetry_UseOnlyCurrentRecipientCode_AndOldPendingClaimsAreRejected()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        await ApproveAsync(f, id, admin);
        var detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        await using var db = f.Context();
        var target = await db.Invitations.AsNoTracking().SingleAsync(i => i.RosterRowId == RowId(detail));
        var oldAttempt = (await db.AuditLogs.SingleAsync(a => a.Action == "EMAIL_SEND_REQUESTED" && a.EntityId == target.Id.ToString("D"))).CorrelationId!.Value;
        var oldCode = await CodeAsync(f, target.Id);
        var services = new ServiceCollection(); services.AddLogging(); services.AddApplication();
        services.AddInfrastructure(new ConfigurationBuilder().AddInMemoryCollection(InvitationPrimitiveTests.ConfigurationValues()
            .Select(p => new KeyValuePair<string, string?>(p.Key, p.Value)).Append(new("ConnectionStrings:DefaultConnection", f.Database.ConnectionString))).Build());
        await using var provider = services.BuildServiceProvider();
        async Task<T> Send<T>(IRequest<T> command) { await using var scope = provider.CreateAsyncScope(); return await scope.ServiceProvider.GetRequiredService<ISender>().Send(command); }
        var oldClaim = await Send(new ClaimEmailCommand(oldAttempt, false));
        Assert.NotNull(oldClaim);
        Assert.Equal("viewer@example.test", oldClaim.Recipient);
        await f.Database.ExecuteAsync($"UPDATE dbo.AuditLogs SET OccurredAt=DATEADD(minute,-2,OccurredAt) WHERE CorrelationId='{oldAttempt}' AND Action='EMAIL_SEND_REQUESTED';");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Support(id) + $"/{target.Id}/resend", new {
            requestId = Guid.NewGuid(), expectedRowVersion = Convert.ToBase64String(target.RowVersion) }, token: admin)).Status);
        var oldPending = (await db.AuditLogs.OrderByDescending(a => a.Id).FirstAsync(a => a.Action == "EMAIL_SEND_REQUESTED")).CorrelationId!.Value;
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), Write(detail), token: admin)).Status);
        Assert.Null(await Send(new ClaimEmailCommand(oldPending, false)));
        // Already claimed mail cannot be recalled. Recording its acceptance must not replace the new attempt's status.
        await Send(new RecordEmailResultCommand(oldAttempt, "ACCEPTED", "OK"));
        var pendingView = (await f.SendAsync(HttpMethod.Get, Support(id))).Data.GetProperty("items");
        Assert.Equal("PENDING", pendingView.EnumerateArray().Single(i => i.GetProperty("id").GetGuid() == target.Id).GetProperty("emailStatus").GetString());
        var attempt = (await db.AuditLogs.OrderByDescending(a => a.Id).FirstAsync(a => a.Action == "EMAIL_SEND_REQUESTED")).CorrelationId!.Value;
        var claimed = await Send(new ClaimEmailCommand(attempt, false));
        Assert.NotNull(claimed);
        Assert.Equal("fixed@example.test", claimed.Recipient);
        Assert.Equal(2, claimed.AccessVersion);
        await Send(new RecordEmailResultCommand(attempt, "FAILED", "PROVIDER_REJECTED"));
        var items = (await f.SendAsync(HttpMethod.Get, Support(id))).Data.GetProperty("items");
        var item = items.EnumerateArray().Single(i => i.GetProperty("id").GetGuid() == target.Id);
        Assert.Equal("FAILED", item.GetProperty("emailStatus").GetString());
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "join", oldCode)).Status);
        var newCode = await CodeAsync(f, target.Id);
        var retryId = Guid.NewGuid();
        var retry = new { requestId = retryId, expectedRowVersion = Version(item) };
        Conflict(await f.SendAsync(HttpMethod.Post, Support(id) + $"/{target.Id}/resend", retry, token: admin), "EMAIL_COOLDOWN");
        await f.Database.ExecuteAsync($"UPDATE dbo.AuditLogs SET OccurredAt=DATEADD(minute,-2,OccurredAt) WHERE CorrelationId='{attempt}' AND Action='EMAIL_SEND_REQUESTED';");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Support(id) + $"/{target.Id}/resend", retry, token: admin)).Status);
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Support(id) + $"/{target.Id}/resend", retry, token: admin)).Status);
        Assert.Equal(newCode, await CodeAsync(f, target.Id));
        var latest = (await db.AuditLogs.OrderByDescending(a => a.Id).FirstAsync(a => a.Action == "EMAIL_SEND_REQUESTED")).CorrelationId!.Value;
        var resent = await Send(new ClaimEmailCommand(latest, false));
        Assert.NotNull(resent);
        Assert.Equal(claimed.Recipient, resent.Recipient);
        Assert.Equal(claimed.ProtectedCode, resent.ProtectedCode);
        await Send(new RecordEmailResultCommand(latest, "ACCEPTED", "OK"));
        Assert.Equal("APPROVED", (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data.GetProperty("summary").GetProperty("state").GetString());
    }

    [SchemaV11Fact]
    public async Task InvitationConcurrencyAndExpiry_DoNotPermitStaleRotationOrExpiredAccessRevival()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        await ApproveAsync(f, id, admin);
        var detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        var item = (await f.SendAsync(HttpMethod.Get, Support(id))).Data.GetProperty("items")[0];
        var invitation = item.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Support(id) + $"/{invitation}/revoke", new {
            requestId = Guid.NewGuid(), expectedRowVersion = Version(item) }, token: admin)).Status);
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), Write(detail), token: admin), "STALE_VERSION");
        detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), Write(detail) with { ExpectedInvitationRowVersion = null }, token: admin), "STALE_VERSION");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), Write(detail), token: admin)).Status);
        await f.Database.ExecuteAsync($"UPDATE dbo.Invitations SET ExpiresAt=DATEADD(day,-1,SYSDATETIMEOFFSET()) WHERE Id='{invitation}';");
        detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        Conflict(await f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), Write(detail, "expired@example.test"), token: admin), "INVITATION_UNAVAILABLE");
        Assert.Equal("fixed@example.test", (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data.GetProperty("roster")[0].GetProperty("email").GetString());
    }

    [SchemaV11Fact]
    public async Task CorrectionAndReissueOfSameInvitation_HaveOneWinnerAndOneNewEmail()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "rep.admin");
        var id = await SubmitAsync(f);
        await ApproveAsync(f, id, admin);
        var detail = (await f.SendAsync(HttpMethod.Get, Detail(id), token: admin)).Data;
        var item = (await f.SendAsync(HttpMethod.Get, Support(id))).Data.GetProperty("items")[0];
        var invitation = item.GetProperty("id").GetGuid();
        await f.Database.ExecuteAsync("UPDATE dbo.AuditLogs SET OccurredAt=DATEADD(minute,-2,OccurredAt) WHERE Action='EMAIL_SEND_REQUESTED';");
        var outcomes = await Task.WhenAll(f.SendAsync(HttpMethod.Post, Path(id, RowId(detail)), Write(detail), token: admin),
            f.SendAsync(HttpMethod.Post, Support(id) + $"/{invitation}/reissue", new { requestId = Guid.NewGuid(), expectedRowVersion = Version(item) }, token: admin));
        Assert.Single(outcomes, r => r.Status == HttpStatusCode.OK);
        Conflict(Assert.Single(outcomes, r => r.Status == HttpStatusCode.Conflict), "STALE_VERSION");
        await using var db = f.Context();
        Assert.Equal(2, (await db.Invitations.SingleAsync(i => i.Id == invitation)).AccessVersion);
        Assert.Equal(3, await db.AuditLogs.CountAsync(a => a.Action == "EMAIL_SEND_REQUESTED"));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "INVITATION_REISSUE" || a.Action == CorrectRosterEmailCommandHandler.AuditAction));
    }
}
