using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail;
using SmartCampus.Infrastructure;
using static SmartCampus.IntegrationTests.RepresentativeEndpointTests;

namespace SmartCampus.IntegrationTests;

public sealed class RosterEmailCorrectionEndpointTests
{
    private static string RegistrationPath(Guid id) => $"/api/staff/manage/registrations/{id}";
    private static string LegacyPath(Guid id, Guid rowId) => $"/api/admin/registrations/{id}/roster/{rowId}/email";

    private static IReadOnlyDictionary<string, string> Settings() => InvitationPrimitiveTests.ConfigurationValues()
        .ToDictionary(pair => pair.Key.Replace(":", "__"), pair => pair.Value);

    private static async Task<Guid> SubmitAsync(Fixture fixture)
    {
        var tour = await fixture.DataAsync($"/tours/{fixture.TourId}");
        var response = await fixture.SendAsync(HttpMethod.Post, $"/tours/{fixture.TourId}/registrations",
            Input(tour, "Email change", "viewer@example.test", mixed: true), Guid.NewGuid());
        Assert.Equal(HttpStatusCode.OK, response.Status);
        return response.Data.GetProperty("id").GetGuid();
    }

    private static async Task<JsonElement> AcceptFirstRowAsync(Fixture fixture, Guid registrationId, string staff)
    {
        var detail = (await fixture.SendAsync(HttpMethod.Get, RegistrationPath(registrationId), token: staff)).Data;
        var row = detail.GetProperty("roster")[0];
        var accepted = await fixture.SendAsync(HttpMethod.Post,
            $"{RegistrationPath(registrationId)}/rows/{row.GetProperty("id").GetGuid()}/accept", new
            {
                requestId = Guid.NewGuid(), expectedRegistrationRowVersion = Version(detail),
                expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
                expectedRowVersion = Version(row)
            }, token: staff);
        Assert.Equal(HttpStatusCode.OK, accepted.Status);
        return (await fixture.SendAsync(HttpMethod.Get, RegistrationPath(registrationId), token: staff)).Data;
    }

    private static object ChangeRequest(JsonElement detail, JsonElement row, string email) => new
    {
        requestId = Guid.NewGuid(), proposedEmail = email,
        expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
        expectedRegistrationRowVersion = Version(detail), expectedRowVersion = Version(row)
    };

    private static async Task<string> InvitationCodeAsync(Fixture fixture, Guid invitationId)
    {
        await using var db = fixture.Context();
        var invitation = await db.Invitations.SingleAsync(item => item.Id == invitationId);
        return new SmartCampus.Infrastructure.Integrations.Invitations.InvitationCodeService(
            InvitationPrimitiveTests.Configuration()).Reveal(invitation.Id, invitation.AccessVersion, invitation.AccessCodeProtected);
    }

    private static async Task<(HttpStatusCode Status, string? Cookie)> ViewerAccessAsync(HttpClient client, Guid tourId,
        string operation, string? code = null, string? cookie = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/student/tours/{tourId}/{operation}");
        if (code is not null) request.Content = System.Net.Http.Json.JsonContent.Create(new { accessCode = code });
        if (cookie is not null) request.Headers.Add("Cookie", cookie);
        using var response = await client.SendAsync(request);
        return (response.StatusCode, response.Headers.TryGetValues("Set-Cookie", out var values)
            ? string.Join("; ", values.Select(value => value.Split(';')[0])) : null);
    }

    [SchemaV11Fact]
    public async Task RepresentativeRequestsEmailChange_StaffAcceptsForOneStableRow_AndLegacyAdminWriteIsDisabled()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(
            fixture.Database.ConnectionString, Settings());
        var representative = await LoginAsync(host.Client, "rep.one");
        var staff = await LoginAsync(host.Client, "review.staff");
        var admin = await LoginAsync(host.Client, "rep.admin");
        fixture.Bind(host.Client, representative);

        var registrationId = await SubmitAsync(fixture);
        var detail = await AcceptFirstRowAsync(fixture, registrationId, staff);
        var row = detail.GetProperty("roster")[0];
        var rowId = row.GetProperty("id").GetGuid();
        var originalEmail = row.GetProperty("email").GetString();
        var untouchedRow = detail.GetProperty("roster").EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() != rowId);
        var untouchedRowId = untouchedRow.GetProperty("id").GetGuid();
        var untouchedEmail = untouchedRow.GetProperty("email").GetString();
        var request = ChangeRequest(detail, row, "  NEW-VIEWER@EXAMPLE.TEST ");

        var submitted = await fixture.SendAsync(HttpMethod.Post,
            $"/registrations/{registrationId}/rows/{rowId}/email-change-requests", request);
        Assert.Equal(HttpStatusCode.OK, submitted.Status);
        var requestId = submitted.Data.GetGuid();
        var queue = await fixture.SendAsync(HttpMethod.Get,
            "/api/staff/manage/roster-email-change-requests?state=PENDING", token: staff);
        var pending = Assert.Single(queue.Data.EnumerateArray());
        Assert.Equal(requestId, pending.GetProperty("id").GetGuid());
        Assert.Equal(originalEmail, pending.GetProperty("currentEmail").GetString());
        Assert.Equal("new-viewer@example.test", pending.GetProperty("proposedEmail").GetString());

        var accepted = await fixture.SendAsync(HttpMethod.Post,
            $"/api/staff/manage/roster-email-change-requests/{requestId}/accept", new
            {
                requestId = Guid.NewGuid(), expectedRequestRowVersion = Version(pending),
                expectedTourRowVersion = pending.GetProperty("tourRowVersion").GetString(),
                expectedRegistrationRowVersion = pending.GetProperty("registrationRowVersion").GetString(),
                expectedRowVersion = pending.GetProperty("rosterRowVersion").GetString()
            }, token: staff);
        Assert.Equal(HttpStatusCode.OK, accepted.Status);

        detail = (await fixture.SendAsync(HttpMethod.Get, RegistrationPath(registrationId), token: staff)).Data;
        var currentRows = detail.GetProperty("roster").EnumerateArray().ToArray();
        var changedRow = currentRows.Single(item => item.GetProperty("id").GetGuid() == rowId);
        var stillUnchangedRow = currentRows.Single(item => item.GetProperty("id").GetGuid() == untouchedRowId);
        Assert.NotEqual(originalEmail, changedRow.GetProperty("email").GetString());
        Assert.Equal("new-viewer@example.test", changedRow.GetProperty("email").GetString());
        Assert.Equal(untouchedEmail, stillUnchangedRow.GetProperty("email").GetString());
        Assert.Equal("ACCEPTED", (await fixture.SendAsync(HttpMethod.Get,
            $"/api/staff/manage/roster-email-change-requests/{requestId}", token: staff))
            .Data.GetProperty("state").GetString());

        // Direct Admin email mutation remains an explicitly disabled compatibility route.
        var legacy = await fixture.SendAsync(HttpMethod.Post, LegacyPath(registrationId, rowId), new
        {
            requestId = Guid.NewGuid(), email = "legacy@example.test", expectedRowVersion = Version(detail),
            expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
            expectedRosterRowVersion = Version(changedRow)
        }, token: admin);
        Assert.Equal(HttpStatusCode.Conflict, legacy.Status);
        Assert.Equal("LEGACY_EMAIL_CORRECTION_DISABLED", legacy.Body.GetProperty("errors").GetProperty("code").GetString());

        await using var db = fixture.Context();
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "ROSTER_EMAIL_CHANGE_REQUESTED"));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.Action == "ROSTER_EMAIL_CHANGE_ACCEPTED"));
        Assert.Empty(await db.AuditLogs.Where(a => a.Action == CorrectRosterEmailCommandHandler.AuditAction).ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task EmailChangeRequestIsOwnerScoped_AndStaffRejectionLeavesRosterUnchanged()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString);
        var representative = await LoginAsync(host.Client, "rep.one");
        var otherRepresentative = await LoginAsync(host.Client, "rep.two");
        var staff = await LoginAsync(host.Client, "review.staff");
        fixture.Bind(host.Client, representative);

        var registrationId = await SubmitAsync(fixture);
        var detail = await AcceptFirstRowAsync(fixture, registrationId, staff);
        var row = detail.GetProperty("roster")[0];
        var rowId = row.GetProperty("id").GetGuid();
        var request = ChangeRequest(detail, row, "new-viewer@example.test");
        var create = await fixture.SendAsync(HttpMethod.Post,
            $"/registrations/{registrationId}/rows/{rowId}/email-change-requests", request);
        Assert.Equal(HttpStatusCode.OK, create.Status);
        var requestId = create.Data.GetGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await fixture.SendAsync(HttpMethod.Get,
            $"/registrations/{registrationId}", token: otherRepresentative)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await fixture.SendAsync(HttpMethod.Get,
            "/api/staff/manage/roster-email-change-requests?state=PENDING", token: representative)).Status);

        var queueItem = Assert.Single((await fixture.SendAsync(HttpMethod.Get,
            "/api/staff/manage/roster-email-change-requests?state=PENDING", token: staff)).Data.EnumerateArray());
        var rejected = await fixture.SendAsync(HttpMethod.Post,
            $"/api/staff/manage/roster-email-change-requests/{requestId}/reject", new
            {
                requestId = Guid.NewGuid(), expectedRequestRowVersion = Version(queueItem),
                expectedTourRowVersion = queueItem.GetProperty("tourRowVersion").GetString(),
                expectedRegistrationRowVersion = queueItem.GetProperty("registrationRowVersion").GetString(),
                expectedRowVersion = queueItem.GetProperty("rosterRowVersion").GetString(), reason = "Keep the current address"
            }, token: staff);
        Assert.Equal(HttpStatusCode.OK, rejected.Status);

        detail = (await fixture.SendAsync(HttpMethod.Get, RegistrationPath(registrationId), token: staff)).Data;
        Assert.Equal("viewer@example.test", detail.GetProperty("roster")[0].GetProperty("email").GetString());
        var resolved = await fixture.SendAsync(HttpMethod.Get,
            $"/api/staff/manage/roster-email-change-requests/{requestId}", token: staff);
        Assert.Equal("REJECTED", resolved.Data.GetProperty("state").GetString());
        Assert.Equal("Keep the current address", resolved.Data.GetProperty("reviewReason").GetString());
    }

    [SchemaV11Fact]
    public async Task EmailChangeIdempotencyPendingConflictAndSessionRotationAreRowScoped()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString, Settings());
        var representative = await LoginAsync(host.Client, "rep.one");
        var staff = await LoginAsync(host.Client, "review.staff");
        fixture.Bind(host.Client, representative);
        var registrationId = await SubmitAsync(fixture);
        var detail = await AcceptFirstRowAsync(fixture, registrationId, staff);
        var rowA = detail.GetProperty("roster")[0];
        var rowAId = rowA.GetProperty("id").GetGuid();
        var rowB = detail.GetProperty("roster").EnumerateArray().Single(item => item.GetProperty("id").GetGuid() != rowAId);
        var rowBId = rowB.GetProperty("id").GetGuid();
        var acceptB = await fixture.SendAsync(HttpMethod.Post,
            $"{RegistrationPath(registrationId)}/rows/{rowBId}/accept", new
            {
                requestId = Guid.NewGuid(), expectedRegistrationRowVersion = Version(detail),
                expectedTourRowVersion = detail.GetProperty("tourRowVersion").GetString(),
                expectedRowVersion = Version(rowB)
            }, token: staff);
        Assert.Equal(HttpStatusCode.OK, acceptB.Status);

        await using var inviteDb = fixture.Context();
        var inviteA = await inviteDb.Invitations.Where(item => item.RosterRowId == rowAId).Select(item => item.Id).SingleAsync();
        var inviteB = await inviteDb.Invitations.Where(item => item.RosterRowId == rowBId).Select(item => item.Id).SingleAsync();
        var joinedA = await ViewerAccessAsync(host.Client, fixture.TourId, "join", await InvitationCodeAsync(fixture, inviteA));
        var joinedB = await ViewerAccessAsync(host.Client, fixture.TourId, "join", await InvitationCodeAsync(fixture, inviteB));
        Assert.Equal(HttpStatusCode.OK, joinedA.Status);
        Assert.Equal(HttpStatusCode.OK, joinedB.Status);
        var cookieA = joinedA.Cookie!;
        var cookieB = joinedB.Cookie!;

        detail = (await fixture.SendAsync(HttpMethod.Get, $"/registrations/{registrationId}")).Data;
        rowA = detail.GetProperty("roster").EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == rowAId);
        var firstRequest = ChangeRequest(detail, rowA, "new-viewer@example.test");
        var first = await fixture.SendAsync(HttpMethod.Post,
            $"/registrations/{registrationId}/rows/{rowAId}/email-change-requests", firstRequest);
        Assert.Equal(HttpStatusCode.OK, first.Status);
        var requestEntityId = first.Data.GetGuid();
        var replay = await fixture.SendAsync(HttpMethod.Post,
            $"/registrations/{registrationId}/rows/{rowAId}/email-change-requests", firstRequest);
        Assert.Equal(HttpStatusCode.OK, replay.Status);
        Assert.Equal(requestEntityId, replay.Data.GetGuid());
        var competing = await fixture.SendAsync(HttpMethod.Post,
            $"/registrations/{registrationId}/rows/{rowAId}/email-change-requests",
            ChangeRequest(detail, rowA, "another@example.test"));
        Assert.Equal(HttpStatusCode.Conflict, competing.Status);
        Assert.Equal("EMAIL_CHANGE_PENDING", competing.Body.GetProperty("errors").GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.OK, (await ViewerAccessAsync(host.Client, fixture.TourId, "session", cookie: cookieA)).Status);
        Assert.Equal(HttpStatusCode.OK, (await ViewerAccessAsync(host.Client, fixture.TourId, "session", cookie: cookieB)).Status);

        var pending = (await fixture.SendAsync(HttpMethod.Get,
            "/api/staff/manage/roster-email-change-requests?state=PENDING", token: staff)).Data.EnumerateArray().Single();
        var rejected = await fixture.SendAsync(HttpMethod.Post,
            $"/api/staff/manage/roster-email-change-requests/{requestEntityId}/reject", new
            {
                requestId = Guid.NewGuid(), expectedRequestRowVersion = Version(pending),
                expectedTourRowVersion = pending.GetProperty("tourRowVersion").GetString(),
                expectedRegistrationRowVersion = pending.GetProperty("registrationRowVersion").GetString(),
                expectedRowVersion = pending.GetProperty("rosterRowVersion").GetString(), reason = "Retain old email"
            }, token: staff);
        Assert.Equal(HttpStatusCode.OK, rejected.Status);
        Assert.Equal(HttpStatusCode.OK, (await ViewerAccessAsync(host.Client, fixture.TourId, "session", cookie: cookieA)).Status);
        Assert.Equal(HttpStatusCode.OK, (await ViewerAccessAsync(host.Client, fixture.TourId, "session", cookie: cookieB)).Status);

        detail = (await fixture.SendAsync(HttpMethod.Get, RegistrationPath(registrationId), token: staff)).Data;
        rowA = detail.GetProperty("roster").EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == rowAId);
        var secondRequest = ChangeRequest(detail, rowA, "new-viewer@example.test");
        var second = await fixture.SendAsync(HttpMethod.Post,
            $"/registrations/{registrationId}/rows/{rowAId}/email-change-requests", secondRequest);
        Assert.Equal(HttpStatusCode.OK, second.Status);
        var secondId = second.Data.GetGuid();
        pending = (await fixture.SendAsync(HttpMethod.Get,
            "/api/staff/manage/roster-email-change-requests?state=PENDING", token: staff)).Data.EnumerateArray().Single();
        var accepted = await fixture.SendAsync(HttpMethod.Post,
            $"/api/staff/manage/roster-email-change-requests/{secondId}/accept", new
            {
                requestId = Guid.NewGuid(), expectedRequestRowVersion = Version(pending),
                expectedTourRowVersion = pending.GetProperty("tourRowVersion").GetString(),
                expectedRegistrationRowVersion = pending.GetProperty("registrationRowVersion").GetString(),
                expectedRowVersion = pending.GetProperty("rosterRowVersion").GetString()
            }, token: staff);
        Assert.Equal(HttpStatusCode.OK, accepted.Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ViewerAccessAsync(host.Client, fixture.TourId, "session", cookie: cookieA)).Status);
        Assert.Equal(HttpStatusCode.OK, (await ViewerAccessAsync(host.Client, fixture.TourId, "session", cookie: cookieB)).Status);
        await using var db = fixture.Context();
        Assert.Equal("new-viewer@example.test", (await db.RosterRows.SingleAsync(row => row.Id == rowAId)).Email);
        Assert.Equal("REJECTED", (await db.RosterEmailChangeRequests.SingleAsync(request => request.Id == requestEntityId)).State);
        Assert.Equal("ACCEPTED", (await db.RosterEmailChangeRequests.SingleAsync(request => request.Id == secondId)).State);
    }

    [SchemaV11Fact]
    public async Task ConcurrentEmailChangeRequestsForOneRowCreateAtMostOnePendingRequest()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var host = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(fixture.Database.ConnectionString);
        fixture.Bind(host.Client, await LoginAsync(host.Client, "rep.one"));
        var registrationId = await SubmitAsync(fixture);
        var detail = await AcceptFirstRowAsync(fixture, registrationId, await LoginAsync(host.Client, "review.staff"));
        var row = detail.GetProperty("roster")[0];
        var rowId = row.GetProperty("id").GetGuid();
        var results = await Task.WhenAll(
            fixture.SendAsync(HttpMethod.Post, $"/registrations/{registrationId}/rows/{rowId}/email-change-requests",
                ChangeRequest(detail, row, "first-proposal@example.test")),
            fixture.SendAsync(HttpMethod.Post, $"/registrations/{registrationId}/rows/{rowId}/email-change-requests",
                ChangeRequest(detail, row, "second-proposal@example.test")));
        Assert.Single(results, result => result.Status == HttpStatusCode.OK);
        var conflict = Assert.Single(results, result => result.Status == HttpStatusCode.Conflict);
        Assert.Equal("EMAIL_CHANGE_PENDING", conflict.Body.GetProperty("errors").GetProperty("code").GetString());
        await using var db = fixture.Context();
        Assert.Equal(1, await db.RosterEmailChangeRequests.CountAsync(request => request.RosterRowId == rowId && request.State == "PENDING"));
        Assert.Equal("viewer@example.test", (await db.RosterRows.SingleAsync(current => current.Id == rowId)).Email);
    }
}
