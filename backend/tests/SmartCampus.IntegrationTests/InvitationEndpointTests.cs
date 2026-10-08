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
        var detail = (await f.SendAsync(HttpMethod.Get, $"/api/admin/registrations/{id}", token: admin)).Data;
        var result = await f.SendAsync(HttpMethod.Post, $"/api/admin/registrations/{id}/approve", new {
            expectedRowVersion = Version(detail), expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString() }, token: admin);
        Assert.Equal(HttpStatusCode.OK, result.Status);
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
            ? cookies.First() : null);
    }
    private static async Task<string> CodeAsync(Fixture f, Guid invitationId)
    {
        await using var db = f.Context();
        var invitation = await db.Invitations.SingleAsync(i => i.Id == invitationId);
        return new InvitationCodeService(InvitationPrimitiveTests.Configuration()).Reveal(invitation.Id, invitation.AccessVersion, invitation.AccessCodeProtected);
    }

    [SchemaV11Fact]
    public async Task LeaveFailure_StillClearsCookie_AndJoinLimitReturnsTheNormalEnvelope()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "rep.admin"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        var invitation = item.GetProperty("id").GetGuid();
        var join = await AccessAsync(host.Client, f.TourId, "join", await CodeAsync(f, invitation));
        var cookie = join.Cookie!.Split(';')[0];
        await f.Database.ExecuteAsync("CREATE TRIGGER dbo.FailSessionClose ON dbo.BrowserSessions AFTER UPDATE AS BEGIN THROW 51012, 'Test-only session failure.', 1; END;");
        var leave = await AccessAsync(host.Client, f.TourId, "leave", cookie: cookie);
        Assert.Equal(HttpStatusCode.InternalServerError, leave.Status);
        Assert.Contains("expires=", leave.Cookie!, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Test-only", leave.Body.GetRawText());
        await f.Database.ExecuteAsync("DROP TRIGGER dbo.FailSessionClose;");
        // The successful join already consumed one of the 60 permits.
        for (var index = 0; index < 59; index++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await AccessAsync(host.Client, f.TourId, "join", "INVALID")).Status);
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
        var id = await ApproveAsync(f, await LoginAsync(previousHost.Client, "rep.admin"));
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
    public async Task TerminalAndExpiredAccess_CannotSendOrExtendExpiry_EndEarlyCanStillRevoke()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "rep.admin"));
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
        var admin = await LoginAsync(host.Client, "rep.admin");
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
        var cookie = join.Cookie!.Split(';')[0];
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
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "rep.admin"));
        var item = (await f.SendAsync(HttpMethod.Get, Path(id))).Data.GetProperty("items")[0];
        var invitation = item.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await f.SendAsync(HttpMethod.Get, Path(id), token: await LoginAsync(host.Client, "rep.two"))).Status);
        var staff = await LoginAsync(host.Client, "invite.staff");
        Assert.Equal(HttpStatusCode.Forbidden, (await f.SendAsync(HttpMethod.Get, Path(id), token: staff)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.SendAsync(HttpMethod.Post, Path(id) + $"/{invitation}/revoke", Write(item, Guid.NewGuid()), token: staff)).Status);
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
    public async Task DeliveryClaims_AreExclusive_ResultsAppendOnce_AndInterruptedAttemptsBecomeUnknown()
    {
        await using var f = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(f.Database.ConnectionString, Settings());
        f.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var id = await ApproveAsync(f, await LoginAsync(host.Client, "rep.admin"));
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
        Assert.Single(claims, c => c is not null);
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
}
