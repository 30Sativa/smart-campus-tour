using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application;
using SmartCampus.Infrastructure;
using SmartCampus.Infrastructure.Integrations.Invitations;
using SmartCampus.Application.Features.Invitations.Commands.DeliverEmail;
using static SmartCampus.IntegrationTests.RepresentativeEndpointTests;

namespace SmartCampus.IntegrationTests;

public sealed class InvitationEndpointTests
{
    private static string Path(Guid id) => $"/api/registrations/{id}/invitations";
    private static IReadOnlyDictionary<string, string> Settings() => InvitationPrimitiveTests.ConfigurationValues()
        .ToDictionary(p => p.Key.Replace(":", "__"), p => p.Value);
    private static async Task<Guid> ApproveAsync(Fixture f, string admin)
    {
        var tour = await f.DataAsync($"/tours/{f.TourId}");
        var submit = await f.SendAsync(HttpMethod.Post, $"/tours/{f.TourId}/registrations", Input(tour, "Group", "viewer@example.test", mixed: true), Guid.NewGuid());
        var id = submit.Data.GetProperty("id").GetGuid();
        var detail = (await f.SendAsync(HttpMethod.Get, $"/api/staff/manage/registrations/{id}", token: admin)).Data;
        foreach (var row in detail.GetProperty("roster").EnumerateArray().ToArray())
        {
            detail = (await f.SendAsync(HttpMethod.Get, $"/api/staff/manage/registrations/{id}", token: admin)).Data;
            var current = detail.GetProperty("roster").EnumerateArray()
                .Single(item => item.GetProperty("id").GetGuid() == row.GetProperty("id").GetGuid());
            var result = await f.SendAsync(HttpMethod.Post,
                $"/api/staff/manage/registrations/{id}/rows/{current.GetProperty("id").GetGuid()}/accept", new {
                    requestId = Guid.NewGuid(), expectedRegistrationRowVersion = Version(detail),
                    expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
                    expectedRowVersion = Version(current) }, token: admin);
            Assert.Equal(HttpStatusCode.OK, result.Status);
        }
        return id;
    }
    private static object Write(JsonElement item, Guid request) => new { requestId = request, expectedRowVersion = Version(item) };
    private static async Task<(HttpStatusCode Status, JsonElement Body, string? Cookie)> AccessAsync(HttpClient client, Guid tour,
        string action, string? code = null, string? cookie = null, string? origin = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/student/tours/{tour}/{action}");
        if (code is not null) request.Content = JsonContent.Create(new { accessCode = code });
        if (cookie is not null) request.Headers.Add("Cookie", cookie);
        if (origin is not null) request.Headers.Add("Origin", origin);
        using var response = await client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        return (response.StatusCode, json.RootElement.Clone(), response.Headers.TryGetValues("Set-Cookie", out var cookies)
            ? string.Join("\n", cookies) : null);
    }

    private static string CookieHeader(string setCookie) => string.Join("; ", setCookie.Split('\n', StringSplitOptions.RemoveEmptyEntries)
        .Select(cookie => cookie.Split(';')[0]));
    private static async Task<string> CodeAsync(Fixture f, Guid invitationId)
    {
        await using var db = f.Context();
        var invitation = await db.Invitations.SingleAsync(i => i.Id == invitationId);
        return new InvitationCodeService(InvitationPrimitiveTests.Configuration()).Reveal(invitation.Id, invitation.AccessVersion, invitation.AccessCodeProtected);
    }

    [SchemaV11Fact]
    public async Task CookieTransport_AllowedOrigin_LogoutAndRejoin_PreserveAdmissionAndAuditBoundaries()
    {
        await using var f = await Fixture.CreateAsync();
        const string origin = "https://tour.example.test";
        var settings = Settings().ToDictionary(p => p.Key, p => p.Value);
        settings["Cors__AllowedOrigins__0"] = origin;
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, settings);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        var invitation = item.GetProperty("id").GetGuid();
        var code = await CodeAsync(f, invitation);
        async Task<HttpResponseMessage> Request(string operation, string requestOrigin, string? cookie = null)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/student/tours/{f.TourId:D}/{operation}");
            request.Headers.Add("Origin", requestOrigin);
            if (cookie is not null) request.Headers.Add("Cookie", cookie);
            if (operation == "join") request.Content = JsonContent.Create(new { accessCode = code });
            return await host.Client.SendAsync(request);
        }
        using var join = await Request("join", origin);
        Assert.Equal(HttpStatusCode.OK, join.StatusCode);
        Assert.Equal(origin, join.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", join.Headers.GetValues("Access-Control-Allow-Credentials").Single());
        Assert.True(join.Headers.CacheControl!.NoStore);
        var setCookies = join.Headers.GetValues("Set-Cookie").ToArray();
        Assert.Equal(2, setCookies.Length);
        Assert.Contains(setCookies, value => value.Contains($"path=/api/student/tours/{f.TourId:D}", StringComparison.OrdinalIgnoreCase));
        Assert.All(setCookies, value => Assert.Contains("httponly", value, StringComparison.OrdinalIgnoreCase));
        Assert.All(setCookies, value => Assert.Contains("secure", value, StringComparison.OrdinalIgnoreCase));
        Assert.All(setCookies, value => Assert.Contains("samesite=none", value, StringComparison.OrdinalIgnoreCase));
        var cookie = string.Join("; ", setCookies.Select(value => value.Split(';')[0]));
        using var forbidden = await Request("leave", "https://untrusted.example.test", cookie);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.False(forbidden.Headers.Contains("Set-Cookie"));
        using var session = await Request("session", origin, cookie);
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
        using var leave = await Request("leave", origin, cookie);
        Assert.Equal(HttpStatusCode.OK, leave.StatusCode);
        Assert.Contains("expires=", leave.Headers.GetValues("Set-Cookie").Single(), StringComparison.OrdinalIgnoreCase);
        using var ended = await Request("session", origin, cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, ended.StatusCode);
        using var rejoin = await Request("join", origin);
        Assert.Equal(HttpStatusCode.OK, rejoin.StatusCode);
        await using var db = f.Context();
        Assert.Equal(2, await db.BrowserSessions.CountAsync());
        Assert.Equal(1, await db.BrowserSessions.CountAsync(s => s.EndedAt == null));
        Assert.Equal("LOGOUT", (await db.BrowserSessions.SingleAsync(s => s.EndedAt != null)).EndReason);
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "INVITATION_ENTERED" && a.EntityId == invitation.ToString("D")));
    }

    [SchemaV11Fact]
    public async Task LeaveFailure_StillClearsCookie_AndJoinLimitReturnsTheNormalEnvelope()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        var invitation = item.GetProperty("id").GetGuid();
        var join = await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, invitation));
        var cookie = CookieHeader(join.Cookie!);
        await f.Database.ExecuteAsync("CREATE TRIGGER dbo.FailSessionClose ON dbo.BrowserSessions AFTER UPDATE AS BEGIN THROW 51012, 'Test-only session failure.', 1; END;");
        var leave = await AccessAsync(host.Client, f.TourId, "leave", cookie: cookie);
        Assert.Equal(HttpStatusCode.InternalServerError, leave.Status);
        Assert.Contains("expires=", leave.Cookie!, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Test-only", leave.Body.GetRawText());
        await f.Database.ExecuteAsync("DROP TRIGGER dbo.FailSessionClose;");
        // The successful join already consumed one of the 60 permits. A different code each time stays under the
        // per-code guard (ADR-0048), so this still proves the outer limiter.
        for (var index = 0; index < 59; index++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "join", $"INVALID-{index}")).Status);
        var limited = await AccessAsync(host.Client, f.TourId, "join", "INVALID");
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.Status);
        Assert.Equal("RATE_LIMITED", limited.Body.GetProperty("errors").GetProperty("code").GetString());
    }

    [SchemaV11Fact]
    public async Task PreviouslyApprovedGroups_CanIssueOnce_AndQueueFailureRollsBackIssuance()
    {
        await using var f = await Fixture.CreateAsync();
        await using var previousHost = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(previousHost.Client, await LoginAsync(previousHost.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(previousHost.Client, "review.staff"));
        Assert.Equal(0, await f.Database.CountRowsAsync("dbo.Invitations"));
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        Assert.True((await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("canIssue").GetBoolean());
        var detail = await f.DataAsync($"/registrations/{id}");
        var request = new { requestId = Guid.NewGuid(), expectedRowVersion = Version(detail),
            expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString() };
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs ADD CONSTRAINT CK_TestInvitationQueueFailure CHECK (Action <> 'EMAIL_SEND_REQUESTED');");
        Assert.Equal(HttpStatusCode.InternalServerError, (await f.SendAsync(HttpMethod.Post, Path(id) + "/issue", request)).Status);
        Assert.Equal(0, await f.Database.CountRowsAsync("dbo.Invitations"));
        await f.Database.ExecuteAsync("ALTER TABLE dbo.AuditLogs DROP CONSTRAINT CK_TestInvitationQueueFailure;");
        var pair = await Task.WhenAll(f.SendAsync(HttpMethod.Post, Path(id) + "/issue", request), f.SendAsync(HttpMethod.Post, Path(id) + "/issue", request));
        Assert.All(pair, result => Assert.Equal(HttpStatusCode.OK, result.Status));
        Assert.Equal(2, await f.Database.CountRowsAsync("dbo.Invitations"));
        await using var db = f.Context();
        Assert.Equal(2, await db.AuditLogs.CountAsync(a => a.Action == "EMAIL_SEND_REQUESTED"));
        Assert.False((await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("canIssue").GetBoolean());
    }

    [SchemaV11Fact]
    public async Task RosterDiffCanKeepA_RemoveB_AndAddCPendingWithoutChangingAAccess()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        var representative = await LoginAsync(host.Client, "rep.one");
        var staff = await LoginAsync(host.Client, "review.staff");
        f.Bind(host.Client, representative);
        var registrationId = await ApproveAsync(f, staff);
        var detail = await f.DataAsync($"/registrations/{registrationId}");
        var originalRows = detail.GetProperty("roster").EnumerateArray().ToArray();
        var rowAId = originalRows[0].GetProperty("id").GetGuid();
        var rowBId = originalRows[1].GetProperty("id").GetGuid();

        await using var invitationDb = f.Context();
        var invitationA = await invitationDb.Invitations.Where(item => item.RosterRowId == rowAId).Select(item => item.Id).SingleAsync();
        var invitationB = await invitationDb.Invitations.Where(item => item.RosterRowId == rowBId).Select(item => item.Id).SingleAsync();
        var sessionA = await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, invitationA));
        var sessionB = await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, invitationB));
        Assert.Equal(HttpStatusCode.OK, sessionA.Status);
        Assert.Equal(HttpStatusCode.OK, sessionB.Status);

        var tour = await f.DataAsync($"/tours/{f.TourId}");
        var input = Input(tour, "Group", "viewer@example.test") with
        {
            Roster =
            [
                new(2, "INDIVIDUAL", "Same name", "viewer@example.test", null, rowAId),
                new(6, "INDIVIDUAL", "New viewer", "new@example.test", null)
            ]
        };
        var update = await f.SendAsync(HttpMethod.Put, $"/registrations/{registrationId}",
            new { input, expectedRowVersion = Version(detail) });
        Assert.Equal(HttpStatusCode.OK, update.Status);

        await using (var db = f.Context())
        {
            var rowA = await db.RosterRows.SingleAsync(row => row.Id == rowAId);
            var rowB = await db.RosterRows.SingleAsync(row => row.Id == rowBId);
            var rowC = await db.RosterRows.SingleAsync(row => row.RegistrationId == registrationId && row.Id != rowAId && row.Id != rowBId);
            Assert.True(rowA.IsActive);
            Assert.Equal("ACCEPTED", rowA.ParticipationState);
            Assert.False(rowB.IsActive);
            Assert.Equal("REMOVED", rowB.ParticipationState);
            Assert.True(rowC.IsActive);
            Assert.Equal("PENDING", rowC.ParticipationState);
            var a = await db.Invitations.SingleAsync(invitation => invitation.Id == invitationA);
            var b = await db.Invitations.SingleAsync(invitation => invitation.Id == invitationB);
            Assert.Null(a.RevokedAt);
            Assert.NotNull(b.RevokedAt);
            Assert.Equal(1, await db.BrowserSessions.CountAsync(session => session.InvitationId == invitationA && session.EndedAt == null));
            Assert.Equal(0, await db.BrowserSessions.CountAsync(session => session.InvitationId == invitationB && session.EndedAt == null));
            Assert.Equal("INVITATION_REVOKED", (await db.BrowserSessions.SingleAsync(session => session.InvitationId == invitationB)).EndReason);
            Assert.False(await db.Invitations.AnyAsync(invitation => invitation.RosterRowId == rowC.Id));
        }

        Assert.Equal(HttpStatusCode.OK, (await AccessAsync(host.Client, f.TourId, "session", cookie: CookieHeader(sessionA.Cookie!))).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "session", cookie: CookieHeader(sessionB.Cookie!))).Status);
    }

    [SchemaV11Fact]
    public async Task RosterUpdateEnforcesTenRowsAndRollsBackInvalidOrLateFailure()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var tour = await f.DataAsync($"/tours/{f.TourId}");
        var created = await f.SendAsync(HttpMethod.Post, $"/tours/{f.TourId}/registrations",
            Input(tour, "Capacity", "capacity-0@example.test"), Guid.NewGuid());
        var id = created.Data.GetProperty("id").GetGuid();
        var detail = await f.DataAsync($"/registrations/{id}");
        var originalId = detail.GetProperty("roster")[0].GetProperty("id").GetGuid();
        var roster = Enumerable.Range(0, 10).Select(index => new SmartCampus.Application.Features.Registrations.RosterInput(
            index + 2, "INDIVIDUAL", $"Viewer {index}", $"capacity-{index}@example.test", null,
            index == 0 ? originalId : null)).ToArray();
        var input = Input(tour, "Capacity", "capacity-0@example.test") with { Roster = roster };
        var atLimit = await f.SendAsync(HttpMethod.Put, $"/registrations/{id}", new { input, expectedRowVersion = Version(detail) });
        Assert.Equal(HttpStatusCode.OK, atLimit.Status);
        detail = await f.DataAsync($"/registrations/{id}");
        Assert.Equal(10, detail.GetProperty("roster").GetArrayLength());

        var tooMany = roster.Append(new SmartCampus.Application.Features.Registrations.RosterInput(
            12, "INDIVIDUAL", "Viewer 10", "capacity-10@example.test", null)).ToArray();
        var rejected = await f.SendAsync(HttpMethod.Put, $"/registrations/{id}", new
        {
            input = input with { Roster = tooMany }, expectedRowVersion = Version(detail)
        });
        Assert.Equal(HttpStatusCode.BadRequest, rejected.Status);
        Assert.Equal(10, await f.Database.CountRowsAsync("dbo.RosterRows"));

        var invalid = await f.SendAsync(HttpMethod.Put, $"/registrations/{id}", new
        {
            input = input with { Roster = [roster[0], roster[1] with { Email = roster[0].Email }] },
            expectedRowVersion = Version(detail)
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.Status);
        Assert.Equal(10, await f.Database.CountRowsAsync("dbo.RosterRows"));

        await f.Database.ExecuteAsync("CREATE TRIGGER dbo.FailRegistrationUpdate ON dbo.AuditLogs AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE Action='REGISTRATION_UPDATED') THROW 51013, 'Test-only registration update failure.', 1; END;");
        var failed = await f.SendAsync(HttpMethod.Put, $"/registrations/{id}", new
        {
            input = input with { Roster = [roster[0], new(20, "INDIVIDUAL", "Late", "late@example.test", null)] },
            expectedRowVersion = Version(detail)
        });
        Assert.Equal(HttpStatusCode.InternalServerError, failed.Status);
        await f.Database.ExecuteAsync("DROP TRIGGER dbo.FailRegistrationUpdate;");
        await using var db = f.Context();
        Assert.Equal(10, await db.RosterRows.CountAsync(row => row.RegistrationId == id && row.IsActive));
        Assert.Equal(10, await db.RosterRows.CountAsync(row => row.RegistrationId == id));
        Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "REGISTRATION_UPDATED"));
    }

    [SchemaV11Fact]
    public async Task TerminalAndExpiredAccess_CannotSendOrExtendExpiry_EndEarlyCanStillRevoke()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        var invitationId = item.GetProperty("id").GetGuid();
        var code = await CodeAsync(f, invitationId);
        await f.Database.ExecuteAsync("UPDATE dbo.Tours SET State='CANCELLED',StartedAt=SYSDATETIMEOFFSET();");
        var current = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        Assert.False(current.GetProperty("canReissue").GetBoolean());
        Assert.True(current.GetProperty("canRevoke").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/reissue", Write(current, Guid.NewGuid()))).Status);
        Assert.Equal(HttpStatusCode.OK, (await AccessAsync(host.Client, f.TourId, "join", code)).Status);
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/revoke", Write(current, Guid.NewGuid()))).Status);
        await f.Database.ExecuteAsync("UPDATE dbo.Tours SET State='SCHEDULED'; UPDATE dbo.Invitations SET ExpiresAt=DATEADD(minute,-1,SYSDATETIMEOFFSET());");
        current = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        Assert.False(current.GetProperty("canReissue").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/reissue", Write(current, Guid.NewGuid()))).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "join", code)).Status);
        await using var db = f.Context();
        Assert.Equal(2, await db.AuditLogs.CountAsync(a => a.Action == "EMAIL_SEND_REQUESTED"));
    }

    [SchemaV11Fact]
    public async Task Approval_IssuesPrivateCodes_AndResendPreservesSessions_ReissueAndRevokeInvalidateThem()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var admin = await LoginAsync(host.Client, "review.staff");
        var id = await ApproveAsync(f, admin);
        var list = (await f.SendAsync(HttpMethod.Get, Path(id))).Data;
        Assert.True(list.GetProperty("enabled").GetBoolean());
        Assert.Equal(2, list.GetProperty("items").GetArrayLength());
        var item = list.GetProperty("items")[0]; var invitationId = item.GetProperty("id").GetGuid();
        var code = await CodeAsync(f, invitationId);
        Assert.DoesNotContain(code, list.GetRawText());
        var join = await AccessAsync(host.Client, f.TourId, "join", code);
        Assert.Equal(HttpStatusCode.OK, join.Status);
        Assert.Contains("httponly", join.Cookie!, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", join.Cookie!, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=none", join.Cookie!, StringComparison.OrdinalIgnoreCase);
        var cookie = CookieHeader(join.Cookie!);
        Assert.DoesNotContain(code, join.Body.GetRawText());
        Assert.Equal(HttpStatusCode.OK, (await AccessAsync(host.Client, f.TourId, "session", cookie: cookie)).Status);
        Assert.Equal(HttpStatusCode.Conflict, (await AccessAsync(host.Client, f.TourId, "join", code)).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, Guid.NewGuid(), "join", code)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await AccessAsync(host.Client, f.TourId, "leave", cookie: cookie, origin: "https://evil.test")).Status);

        // A real attempt has a one-minute cooldown; advance only the persisted test clock source.
        await f.Database.ExecuteAsync("UPDATE dbo.AuditLogs SET OccurredAt=DATEADD(minute,-2,OccurredAt) WHERE Action='EMAIL_SEND_REQUESTED';");
        var request = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/resend", Write(item, request))).Status);
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/resend", Write(item, request))).Status);
        Assert.Equal(code, await CodeAsync(f, invitationId));
        Assert.Equal(HttpStatusCode.OK, (await AccessAsync(host.Client, f.TourId, "session", cookie: cookie)).Status);
        Assert.Equal(HttpStatusCode.Conflict, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/resend", Write(item, Guid.NewGuid()))).Status);
        await f.Database.ExecuteAsync("UPDATE dbo.AuditLogs SET OccurredAt=DATEADD(minute,-2,OccurredAt) WHERE Action='EMAIL_SEND_REQUESTED';");
        var expiry = item.GetProperty("expiresAt").GetDateTimeOffset();
        request = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/reissue", Write(item, request))).Status);
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/reissue", Write(item, request))).Status);
        var newCode = await CodeAsync(f, invitationId); Assert.NotEqual(code, newCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "join", code)).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "session", cookie: cookie)).Status);
        var current = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        Assert.Equal(expiry, current.GetProperty("expiresAt").GetDateTimeOffset());
        var next = await AccessAsync(host.Client, f.TourId, "join", newCode);
        Assert.Equal(HttpStatusCode.OK, next.Status);
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/revoke", Write(current, Guid.NewGuid()))).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "join", newCode)).Status);
        await using var db = f.Context();
        Assert.Equal("APPROVED", (await db.GroupRegistrations.SingleAsync()).State);
        Assert.Equal(2, await db.Invitations.CountAsync());
        Assert.All(await db.BrowserSessions.ToArrayAsync(), s => Assert.NotNull(s.EndedAt));
        Assert.All(await db.AuditLogs.ToArrayAsync(), a => {
            Assert.DoesNotContain(code, a.DataJson ?? ""); Assert.DoesNotContain(newCode, a.DataJson ?? "");
            Assert.DoesNotContain("@", a.DataJson ?? "");
        });
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.CorrelationId == request && a.Action == "INVITATION_REISSUE"));
    }

    [SchemaV11Fact]
    public async Task Authorization_AndConcurrentBrowserAdmission_AndIdleReplacement_AreEnforcedBySql()
    {
        await using var f = await Fixture.CreateAsync();
        await f.Database.InsertUserAsync(true, username: "invite.staff", roles: ["STAFF"]);
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        var invitation = item.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Get, Path(id), token: await LoginAsync(host.Client, "rep.two"))).Status);
        // Writes take the shared owner-scoped Tour-first lock: another Representative cannot even locate the group.
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitation}/revoke", Write(item, Guid.NewGuid()),
            token: await LoginAsync(host.Client, "rep.two"))).Status);
        var staff = await LoginAsync(host.Client, "invite.staff");
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{Guid.NewGuid()}/revoke", Write(item, Guid.NewGuid()), token: staff)).Status);
        var admin = await LoginAsync(host.Client, "rep.admin");
        Assert.Equal(HttpStatusCode.Forbidden, (await f.SendAsync(HttpMethod.Get, Path(id), token: admin)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitation}/revoke", Write(item, Guid.NewGuid()), token: admin)).Status);
        var code = await CodeAsync(f, invitation);
        var results = await Task.WhenAll(AccessAsync(host.Client, f.TourId, "join", code), AccessAsync(host.Client, f.TourId, "join", code));
        Assert.Single(results, r => r.Status == HttpStatusCode.OK);
        Assert.Single(results, r => r.Status == HttpStatusCode.Conflict);
        await f.Database.ExecuteAsync("UPDATE dbo.BrowserSessions SET ExpiresAt=DATEADD(minute,-1,SYSDATETIMEOFFSET());");
        Assert.Equal(HttpStatusCode.OK, (await AccessAsync(host.Client, f.TourId, "join", code)).Status);
        await using var db = f.Context();
        Assert.Equal(2, await db.BrowserSessions.CountAsync());
        Assert.Equal(1, await db.BrowserSessions.CountAsync(s => s.EndedAt == null));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "INVITATION_ENTERED" && a.EntityId == invitation.ToString("D")));
        Assert.Equal("IDLE_TIMEOUT", (await db.BrowserSessions.SingleAsync(s => s.EndedAt != null)).EndReason);
        await f.Database.ExecuteAsync("UPDATE dbo.Tours SET State='COMPLETED';");
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "join", code)).Status);
    }

    [SchemaV11Fact]
    public async Task ReconnectGraceRejectsStaleSessionCookieAndRecoversFromDeviceCookieOnly()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var registration = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(registration))).Data.GetProperty("items")[0];
        var invitationId = item.GetProperty("id").GetGuid();
        var joined = await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, invitationId));
        Assert.Equal(HttpStatusCode.OK, joined.Status);
        var cookies = joined.Cookie!.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(value => value.Split(';')[0]).ToArray();
        Assert.Equal(2, cookies.Length);
        var bothCookies = string.Join("; ", cookies);
        var sessionCookie = cookies.Single(cookie => !cookie.Contains("device", StringComparison.OrdinalIgnoreCase));
        var deviceCookie = cookies.Single(cookie => cookie.Contains("device", StringComparison.OrdinalIgnoreCase));

        var staleLastSeen = DateTimeOffset.UtcNow.AddMinutes(-3);
        await using (var db = f.Context())
        {
            var session = await db.BrowserSessions.SingleAsync(row => row.InvitationId == invitationId && row.EndedAt == null);
            session.LastSeenAt = staleLastSeen;
            await db.SaveChangesAsync();
        }
        var stale = await AccessAsync(host.Client, f.TourId, "session", cookie: bothCookies);
        Assert.Equal(HttpStatusCode.Unauthorized, stale.Status);
        Assert.Null(stale.Cookie);
        var deviceOnlyStale = await AccessAsync(host.Client, f.TourId, "session", cookie: deviceCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, deviceOnlyStale.Status);
        Assert.Null(deviceOnlyStale.Cookie);
        await using (var db = f.Context())
        {
            var session = await db.BrowserSessions.SingleAsync(row => row.InvitationId == invitationId && row.EndedAt == null);
            Assert.InRange((session.LastSeenAt!.Value - staleLastSeen).Duration(), TimeSpan.Zero, TimeSpan.FromMilliseconds(2));
            Assert.True(session.LastSeenAt < DateTimeOffset.UtcNow.AddMinutes(-2));
        }

        await using (var db = f.Context())
        {
            var session = await db.BrowserSessions.SingleAsync(row => row.InvitationId == invitationId && row.EndedAt == null);
            session.LastSeenAt = DateTimeOffset.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }
        var deviceOnlyReconnect = await AccessAsync(host.Client, f.TourId, "session", cookie: deviceCookie);
        Assert.Equal(HttpStatusCode.OK, deviceOnlyReconnect.Status);
        Assert.NotNull(deviceOnlyReconnect.Cookie);
        Assert.Contains($"campus_tour_{f.TourId:N}", deviceOnlyReconnect.Cookie!, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "session", cookie: sessionCookie)).Status);
        Assert.Equal(HttpStatusCode.OK, (await AccessAsync(host.Client, f.TourId, "session",
            cookie: CookieHeader(deviceOnlyReconnect.Cookie!))).Status);
    }

    [SchemaV11Fact]
    public async Task DeliveryClaims_AreExclusive_ResultsAppendOnce_AndInterruptedAttemptsBecomeUnknown()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        await using var db = f.Context();
        var attempts = await db.AuditLogs.Where(a => a.Action == "EMAIL_SEND_REQUESTED").OrderBy(a => a.Id).ToArrayAsync();
        var values = InvitationPrimitiveTests.ConfigurationValues().Select(p => new KeyValuePair<string, string?>(p.Key, p.Value))
            .Append(new("ConnectionStrings:DefaultConnection", f.Database.ConnectionString));
        var services = new ServiceCollection(); services.AddLogging(); services.AddApplication();
        services.AddInfrastructure(new ConfigurationBuilder().AddInMemoryCollection(values).Build());
        await using var provider = services.BuildServiceProvider();
        async Task<T> Send<T>(IRequest<T> command) {
            await using var scope = provider.CreateAsyncScope(); return await scope.ServiceProvider.GetRequiredService<ISender>().Send(command);
        }
        var attempt = attempts[0].CorrelationId!.Value;
        var claims = await Task.WhenAll(Send(new ClaimEmailCommand(attempt, false)), Send(new ClaimEmailCommand(attempt, false)));
        var claimed = Assert.Single(claims, c => c is not null)!;
        // The greeting copy comes from the invited row and its registration profile.
        var row = await db.RosterRows.AsNoTracking().Include(r => r.Registration).SingleAsync(r => r.Invitation!.Id == claimed.InvitationId);
        Assert.Equal((row.DisplayName, row.Registration.GroupName, row.Registration.SchoolName, row.RowType == "SHARED_VIEWING"),
            (claimed.RecipientName, claimed.GroupName, claimed.SchoolName, claimed.SharedViewing));
        Assert.All(new[] { claimed.RecipientName, claimed.GroupName, claimed.SchoolName }, value => Assert.False(string.IsNullOrWhiteSpace(value)));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.CorrelationId == attempt && a.Action == "EMAIL_SEND_STARTED"));
        await Send(new RecordEmailResultCommand(attempt, "FAILED", "PROVIDER_REJECTED"));
        await Send(new RecordEmailResultCommand(attempt, "FAILED", "PROVIDER_REJECTED"));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.CorrelationId == attempt && a.Action == "EMAIL_SEND_RESULT"));
        var next = attempts[1].CorrelationId!.Value;
        Assert.NotNull(await Send(new ClaimEmailCommand(next, false)));
        await Send(new ClaimEmailCommand(next, true));
        Assert.Null(await Send(new ClaimEmailCommand(next, false)));
        var view = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items");
        Assert.Contains(view.EnumerateArray(), i => i.GetProperty("emailStatus").GetString() == "FAILED");
        Assert.Contains(view.EnumerateArray(), i => i.GetProperty("emailStatus").GetString() == "UNKNOWN");
        Assert.Equal("APPROVED", (await db.GroupRegistrations.SingleAsync()).State);
    }

    [SchemaV11Fact]
    public async Task InvitationReadsAndMutations_DoNotHydrateHistoricalSessionsOrEmailAttempts()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var registration = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        Guid invitation;
        await using (var seed = f.Context())
        {
            invitation = await seed.Invitations.Select(i => i.Id).FirstAsync();
            var now = DateTimeOffset.UtcNow;
            for (var i = 0; i < 100; i++)
            {
                var correlation = Guid.NewGuid();
                seed.AuditLogs.AddRange(
                    new SmartCampus.Domain.Entities.AuditLog { Action = "EMAIL_SEND_REQUESTED", EntityType = "Invitation", EntityId = invitation.ToString("D"), TourId = f.TourId, CorrelationId = correlation, OccurredAt = now, ResultCode = "PENDING" },
                    new SmartCampus.Domain.Entities.AuditLog { Action = "EMAIL_SEND_RESULT", EntityType = "Invitation", EntityId = invitation.ToString("D"), TourId = f.TourId, CorrelationId = correlation, OccurredAt = now, ResultCode = "FAILED" });
                seed.BrowserSessions.Add(new SmartCampus.Domain.Entities.BrowserSession { Id = Guid.NewGuid(), InvitationId = invitation,
                    SessionTokenHash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("history-" + i)),
                    CreatedAt = now.AddMinutes(-2), ExpiresAt = now.AddMinutes(-1), EndedAt = now, EndReason = "LOGOUT" });
            }
            await seed.SaveChangesAsync();
        }
        await using var db = f.Context();
        var repository = new SmartCampus.Infrastructure.Persistence.Repositories.EfInvitationRepository(db);
        var read = await repository.ReadAsync(registration, null, default);
        Assert.NotNull(read);
        Assert.InRange(read.Audits.Count, 1, read.Invitations.Count * 2);
        Assert.Contains(read.Audits, a => a.Action == "EMAIL_SEND_RESULT" && a.ResultCode == "FAILED");
        await using var transaction = await new SmartCampus.Infrastructure.Persistence.EfRegistrationTransaction(db).BeginAsync(default);
        await new SmartCampus.Infrastructure.Persistence.Repositories.EfRegistrationRepository(db).LockTourAsync(f.TourId, default);
        var loaded = await repository.LoadAsync(registration, default);
        Assert.All(loaded, i => Assert.Empty(i.BrowserSessions));
        Assert.Empty(db.ChangeTracker.Entries<SmartCampus.Domain.Entities.BrowserSession>());
    }

    [SchemaV11Fact]
    public async Task StudentQuestionRevokedDuringTheHttpCall_DiscardsLateAnswerWithoutHoldingTourLock()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var assistant = new FakeAssistantServer { BeforeResponse = release.Task };
        await using var f = await Fixture.CreateAsync();
        var settings = Settings().ToDictionary(p => p.Key, p => p.Value);
        settings["AiAssistant__BaseUrl"] = assistant.BaseUrl;
        settings["AiAssistant__ServiceKey"] = "integration-test-service-key";
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, settings);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var registration = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(registration))).Data.GetProperty("items")[0];
        var invitation = item.GetProperty("id").GetGuid();
        var joined = await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, invitation));
        await f.Database.ExecuteAsync("UPDATE dbo.Tours SET State='RUNNING',StartedAt=SYSDATETIMEOFFSET();");
        var answering = AskAsync(host.Client, f.TourId, CookieHeader(joined.Cookie!), "Synthetic question?");
        try
        {
            await assistant.Received.Task.WaitAsync(TimeSpan.FromSeconds(10));
            item = (await f.SendAsync(HttpMethod.Get, Path(registration))).Data.GetProperty("items")[0];
            Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(registration) + $"/{invitation}/revoke", Write(item, Guid.NewGuid()))).Status);
        }
        finally { release.TrySetResult(); }
        Assert.Equal(HttpStatusCode.Unauthorized, (await answering).Status);
        Assert.Single(assistant.Requests);
    }

    private const string RelayKey = "integration-relay-key-0123456789-abcdef";

    private static async Task<(HttpStatusCode Status, JsonElement Body)> StreamAccessAsync(HttpClient client, Guid tour, string? cookie)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/api/student/tours/{tour}/stream-access");
        if (cookie is not null) request.Headers.Add("Cookie", cookie);
        using var response = await client.SendAsync(request);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return (response.StatusCode, json.RootElement.Clone());
    }

    private static async Task<HttpStatusCode> RelayAsync(HttpClient client, string operation, object body, string key = RelayKey)
    {
        using var response = await client.PostAsJsonAsync($"/api/internal/stream-relay/{operation}?key={key}", body);
        return response.StatusCode;
    }

    [SchemaV11Fact]
    public async Task StreamAccess_OnlyForALiveSessionOnTheRelaysRobot_AndTheRelayFollowsIt()
    {
        await using var f = await Fixture.CreateAsync();
        var settings = Settings().ToDictionary(p => p.Key, p => p.Value);
        settings["QuestRelay__WhepUrl"] = "https://stream.example.test:8889/quest/whep";
        settings["QuestRelay__RobotCode"] = "amr_stream";
        settings["QuestRelay__Key"] = RelayKey;
        settings["QuestRelay__PublishUser"] = "nuc";
        settings["QuestRelay__PublishPasswordSha256"] = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData("nuc-pass"u8));
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, settings);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        var invitationId = item.GetProperty("id").GetGuid();
        var cookie = CookieHeader((await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, invitationId))).Cookie!);
        var (streamRobot, otherRobot) = (Guid.NewGuid(), Guid.NewGuid());
        await using (var db = f.Context())
        {
            foreach (var (robotId, code) in new[] { (streamRobot, "amr_stream"), (otherRobot, "amr_other") })
                db.Robots.Add(new SmartCampus.Domain.Entities.Robot { Id = robotId, RobotCode = code, SourceType = "PHYSICAL", DisplayName = code,
                    IsDispatchEnabled = false, NeedsInspection = false, CreatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await StreamAccessAsync(host.Client, f.TourId, null)).Status);
        // A scheduled Tour with no hold on the relay's robot: nothing to watch yet.
        var waiting = await StreamAccessAsync(host.Client, f.TourId, cookie);
        Assert.Equal(HttpStatusCode.Conflict, waiting.Status);
        Assert.Equal("STREAM_NOT_AVAILABLE", waiting.Body.GetProperty("errors").GetProperty("code").GetString());

        // The waiting room: a READY Tour holding the relay's robot.
        await f.Database.ExecuteAsync($"""
            ALTER TABLE dbo.TourRobotReservations NOCHECK CONSTRAINT ALL;
            INSERT dbo.TourRobotReservations (Id, TourId, RobotId, RouteTestRunId, MeasuredDurationSeconds, StartsAt, EndsAt, ReservedByUserId, ReservedAt)
            VALUES (NEWID(), '{f.TourId}', '{streamRobot}', NEWID(), 600, SYSDATETIMEOFFSET(), DATEADD(HOUR, 1, SYSDATETIMEOFFSET()), NEWID(), SYSDATETIMEOFFSET());
            UPDATE dbo.Tours SET State='READY';
            """);
        var ready = await StreamAccessAsync(host.Client, f.TourId, cookie);
        Assert.Equal(HttpStatusCode.OK, ready.Status);

        await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET State='RUNNING',StartedAt=SYSDATETIMEOFFSET(),AssignedRobotId='{otherRobot}';");
        Assert.Equal(HttpStatusCode.Conflict, (await StreamAccessAsync(host.Client, f.TourId, cookie)).Status);

        await f.Database.ExecuteAsync($"UPDATE dbo.Tours SET AssignedRobotId='{streamRobot}';");
        var running = await StreamAccessAsync(host.Client, f.TourId, cookie);
        Assert.Equal(HttpStatusCode.OK, running.Status);
        var data = running.Body.GetProperty("data");
        Assert.Equal("https://stream.example.test:8889/quest/whep", data.GetProperty("whepUrl").GetString());
        var token = data.GetProperty("token").GetString()!;
        var expiresAt = data.GetProperty("expiresAt").GetDateTimeOffset();
        Assert.InRange(expiresAt - DateTimeOffset.UtcNow, TimeSpan.FromSeconds(60), TimeSpan.FromSeconds(121));

        object Read(string? query) => new { action = "read", path = "quest", protocol = "webrtc", query, user = "", password = "", token = "" };
        Assert.Equal(HttpStatusCode.NoContent, await RelayAsync(host.Client, "auth", Read("token=" + token)));
        Assert.Equal(HttpStatusCode.Forbidden, await RelayAsync(host.Client, "auth", Read(null)));
        Assert.Equal(HttpStatusCode.Unauthorized, await RelayAsync(host.Client, "auth", Read("token=" + token), key: "wrong-key"));
        Assert.Equal(HttpStatusCode.NoContent, await RelayAsync(host.Client, "auth",
            new { action = "publish", path = "quest", protocol = "srt", user = "nuc", password = "nuc-pass" }));
        Assert.Equal(HttpStatusCode.Forbidden, await RelayAsync(host.Client, "auth",
            new { action = "publish", path = "quest", protocol = "srt", user = "nuc", password = "wrong" }));
        Assert.Equal(HttpStatusCode.NoContent, await RelayAsync(host.Client, "recheck", new { path = "quest", query = "token=" + token }));

        // End Early or completion: no new token, the relay refuses the old one, and the reaper is told to kick.
        await f.Database.ExecuteAsync("UPDATE dbo.Tours SET State='CANCELLED',EndedAt=SYSDATETIMEOFFSET();");
        Assert.Equal(HttpStatusCode.Conflict, (await StreamAccessAsync(host.Client, f.TourId, cookie)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, await RelayAsync(host.Client, "auth", Read("token=" + token)));
        Assert.Equal(HttpStatusCode.Forbidden, await RelayAsync(host.Client, "recheck", new { path = "quest", query = "token=" + token }));

        // A revoked invitation ends the session: 401, and its token stops working too.
        await f.Database.ExecuteAsync("UPDATE dbo.Tours SET State='RUNNING',EndedAt=NULL;");
        Assert.Equal(HttpStatusCode.NoContent, await RelayAsync(host.Client, "recheck", new { path = "quest", query = "token=" + token }));
        var current = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/revoke", Write(current, Guid.NewGuid()))).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await StreamAccessAsync(host.Client, f.TourId, cookie)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, await RelayAsync(host.Client, "auth", Read("token=" + token)));
        Assert.Equal(HttpStatusCode.Forbidden, await RelayAsync(host.Client, "recheck", new { path = "quest", query = "token=" + token }));
    }

    [SchemaV11Fact]
    public async Task StreamAccess_WithoutARelayConfigured_HandsOutNothing()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        var cookie = CookieHeader((await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, item.GetProperty("id").GetGuid()))).Cookie!);
        await f.Database.ExecuteAsync("UPDATE dbo.Tours SET State='RUNNING',StartedAt=SYSDATETIMEOFFSET();");

        Assert.Equal(HttpStatusCode.Conflict, (await StreamAccessAsync(host.Client, f.TourId, cookie)).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, await RelayAsync(host.Client, "auth",
            new { action = "publish", path = "quest", user = "nuc", password = "nuc-pass" }));
    }

    private static async Task<(HttpStatusCode Status, JsonElement Body)> AskAsync(HttpClient client, Guid tour, string? cookie, string text)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/student/tours/{tour}/questions");
        request.Content = JsonContent.Create(new { questionId = Guid.NewGuid(), text, recentTurns = Array.Empty<object>() });
        if (cookie is not null) request.Headers.Add("Cookie", cookie);
        using var response = await client.SendAsync(request);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return (response.StatusCode, json.RootElement.Clone());
    }

    [SchemaV11Fact]
    public async Task StudentQuestions_RequireRunningTourAndLiveAccess_AndSendNoSessionData()
    {
        await using var assistant = new FakeAssistantServer();
        await using var f = await Fixture.CreateAsync();
        var settings = Settings().ToDictionary(p => p.Key, p => p.Value);
        settings["AiAssistant__BaseUrl"] = assistant.BaseUrl;
        settings["AiAssistant__ServiceKey"] = "integration-test-service-key";
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, settings);
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "review.staff"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        var invitationId = item.GetProperty("id").GetGuid();
        var join = await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, invitationId));
        var cookie = CookieHeader(join.Cookie!);
        var sessionToken = cookie.Split('=')[1];

        var early = await AskAsync(host.Client, f.TourId, cookie, "Robot dùng cảm biến gì?");
        Assert.Equal(HttpStatusCode.Conflict, early.Status);
        Assert.Equal("TOUR_NOT_RUNNING", early.Body.GetProperty("errors").GetProperty("code").GetString());
        Assert.Empty(assistant.Requests);

        await f.Database.ExecuteAsync("UPDATE dbo.Tours SET State='RUNNING',StartedAt=SYSDATETIMEOFFSET();");
        var answered = await AskAsync(host.Client, f.TourId, cookie, "Robot dùng cảm biến gì?");
        Assert.Equal(HttpStatusCode.OK, answered.Status);
        Assert.Equal("Robot dùng LiDAR.", answered.Body.GetProperty("data").GetProperty("answer").GetString());
        Assert.Equal(JsonValueKind.Null, answered.Body.GetProperty("data").GetProperty("poi").ValueKind);
        var sent = Assert.Single(assistant.Requests);
        Assert.Equal("Bearer integration-test-service-key", sent.Authorization);
        Assert.DoesNotContain("@", sent.Body);
        Assert.DoesNotContain(sessionToken, sent.Body, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AskAsync(host.Client, f.TourId, null, "Robot?")).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await AskAsync(host.Client, f.TourId, cookie, "   ")).Status);

        assistant.Status = 503;
        assistant.ResponseBody = """{"error":"unavailable"}""";
        var down = await AskAsync(host.Client, f.TourId, cookie, "Câu khác?");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, down.Status);
        Assert.Equal("AI_UNAVAILABLE", down.Body.GetProperty("errors").GetProperty("code").GetString());

        assistant.Status = 200;
        assistant.ResponseBody = """{"answer":"Sau thu hồi.","outOfScope":false,"usedSources":[],"contentVersion":"t"}""";
        var current = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        Assert.Equal(HttpStatusCode.OK, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitationId}/revoke", Write(current, Guid.NewGuid()))).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AskAsync(host.Client, f.TourId, cookie, "Câu sau thu hồi?")).Status);
        Assert.Equal(2, assistant.Requests.Count);
    }
}
