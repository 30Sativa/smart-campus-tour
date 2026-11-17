using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0062 on a real database: a POI is discarded while no route revision uses it, and a POI a route uses is retired
/// ("Ngưng dùng") instead. Both share the proposal row lock with SaveRouteRevision.
/// </summary>
public sealed partial class PoiImportSqlTests
{
    [SchemaV11Fact]
    public async Task PassedPoiInNoRoute_IsDiscarded_ButAPoiInAnyRouteRevisionIsNot()
    {
        await using var h = await Harness.Create();
        var free = await Passed(h, "POI_FREE", "Thư viện", 1.5m, 3.5m);
        var used = await Passed(h, "POI_USED", "Hội trường", 1.5m, 1.5m);
        var route = await h.SaveRoute(used.Revision.Id);
        Assert.True(free.CanDiscard);
        Assert.False(free.CanRetire);

        var discarded = await h.Send(new DiscardPoiProposalCommand(h.StaffId, free.Id, new(free.CurrentRevision, free.RowVersion)));
        Assert.NotNull(discarded.DiscardedAt);

        // A newer revision is not in the route, but an older one is: still in a route revision, so not discardable.
        var current = await h.Send(new GetPoiProposalQuery(used.Id));
        current = await h.Send(new CreatePoiRevisionCommand(h.StaffId, used.Id, new(Guid.NewGuid(), current.CurrentRevision, current.RowVersion,
            new(h.MapId, "Hội trường lớn", current.Revision.Purpose, null, current.Revision.X, current.Revision.Y, current.Revision.Yaw, current.Revision.CameraPreset))));
        Assert.False(current.CanDiscard);
        Assert.True(current.CanRetire);
        Assert.False(current.CanReactivate);
        var listed = (await h.Send(new ListPoiProposalsQuery(h.MapId))).Single(item => item.Id == used.Id);
        Assert.False(listed.CanDiscard);
        Assert.True(listed.CanRetire);

        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Send(
            new DiscardPoiProposalCommand(h.StaffId, used.Id, new(current.CurrentRevision, current.RowVersion))));
        Assert.Equal("POI_PROPOSAL_IN_ROUTE", error.Code);

        // The route revision stays readable, and saving a new route with the discarded POI is refused.
        Assert.Equal(2, (await h.Send(new GetRouteRevisionQuery(route.RouteId, route.RevisionId, false))).Stops.Count);
        var save = await Assert.ThrowsAsync<ConflictException>(() => h.SaveRoute(free.Revision.Id));
        Assert.Equal("POI_PROPOSAL_DISCARDED", save.Code);
        await using var db = h.Context();
        Assert.Null((await db.PoiProposals.AsNoTracking().SingleAsync(item => item.Id == used.Id)).DiscardedAt);
    }

    [SchemaV11Fact]
    public async Task NeverPassedPoi_IsStillDiscardable_AndCannotBeRetired()
    {
        await using var h = await Harness.Create();
        var proposalId = (await h.Import([File("a.yaml", "POI_A", verified: false)])).CreatedProposalIds[0];
        var view = await h.Send(new GetPoiProposalQuery(proposalId));
        Assert.True(view.CanDiscard);
        Assert.False(view.CanRetire);

        var error = await Assert.ThrowsAsync<ConflictException>(() => h.Send(
            new RetirePoiProposalCommand(h.StaffId, proposalId, new(Guid.NewGuid(), view.RowVersion))));
        Assert.Equal("POI_NOT_RETIRABLE", error.Code);
        Assert.NotNull((await h.Send(new DiscardPoiProposalCommand(h.StaffId, proposalId, new(view.CurrentRevision, view.RowVersion)))).DiscardedAt);
    }

    [SchemaV11Fact]
    public async Task DiscardAndRouteSave_RacingOnOnePoi_NeverLeaveARouteWithADiscardedPoi()
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            await using var h = await Harness.Create();
            var target = await Passed(h, "POI_RACE", "Thư viện", 1.5m, 3.5m);
            var other = await Passed(h, "POI_OTHER", "Hội trường", 1.5m, 1.5m);
            var stops = new List<RouteRevisionStopInput> { new(target.Revision.Id, 30, [new("FRONT", 10)]), new(other.Revision.Id, 30, [new("FRONT", 10)]) };

            var discard = Capture(h.Send(new DiscardPoiProposalCommand(h.StaffId, target.Id, new(target.CurrentRevision, target.RowVersion))));
            var save = Capture(h.Send(new SaveRouteRevisionCommand(h.StaffId, null, new(Guid.NewGuid(), 0, "Tuyến đua", null, h.MapId,
                2.5m, 2.5m, 0m, "LAST_POI", null, null, null, stops))));
            var errors = await Task.WhenAll(discard, save);

            Assert.Single(errors, e => e is null);
            var refused = Assert.IsType<ConflictException>(Assert.Single(errors, e => e is not null));
            Assert.Contains(refused.Code, new[] { "POI_PROPOSAL_IN_ROUTE", "POI_PROPOSAL_DISCARDED" });
            await using var db = h.Context();
            var discardedInRoute = await db.RouteRevisionStops.CountAsync(stop => stop.PoiProposalRevision.Proposal.DiscardedAt != null);
            Assert.Equal(0, discardedInRoute);
        }

        static async Task<Exception?> Capture(Task task)
        {
            try { await task; return null; }
            catch (Exception error) { return error; }
        }
    }

    [SchemaV11Fact]
    public async Task RetiredPoi_RefusesNewWork_LeavesTheQueue_KeepsRoutes_AndReactivationRestoresIt()
    {
        await using var h = await Harness.Create();
        var poi = await Passed(h, "POI_A", "Hội trường", 1.5m, 1.5m);
        var route = await h.SaveRoute(poi.Revision.Id);
        // A moved, submitted revision waits for Technical Staff.
        var current = await h.Send(new GetPoiProposalQuery(poi.Id));
        current = await h.Send(new CreatePoiRevisionCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), current.CurrentRevision, current.RowVersion,
            new(h.MapId, current.Revision.Name, current.Revision.Purpose, null, 1.5m, 2.5m, current.Revision.Yaw, current.Revision.CameraPreset))));
        current = await h.Send(new SubmitPoiProposalCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), current.CurrentRevision, current.RowVersion)));
        Assert.Contains(await h.Send(new ListPoiVerificationQueueQuery(h.MapId)), item => item.ProposalId == poi.Id);
        var draft = await h.Send(new SavePoiNarrationDraftCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), null, "Bản mới.", null)));

        var requestId = Guid.NewGuid();
        var retired = await h.Send(new RetirePoiProposalCommand(h.StaffId, poi.Id, new(requestId, current.RowVersion)));
        Assert.NotNull(retired.RetiredAt);
        Assert.False(retired.CanRetire);
        Assert.True(retired.CanReactivate);
        Assert.False(retired.CanDiscard);
        // The same request again returns the same result and writes nothing more.
        var again = await h.Send(new RetirePoiProposalCommand(h.StaffId, poi.Id, new(requestId, current.RowVersion)));
        Assert.Equal(retired.RowVersion, again.RowVersion);
        await using (var db = h.Context())
        {
            Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "POI_PROPOSAL_RETIRED" && audit.EntityId == poi.Id.ToString()));
            var row = await db.PoiProposals.AsNoTracking().SingleAsync(item => item.Id == poi.Id);
            Assert.Equal(h.StaffId, row.RetiredByUserId);
            // The stored value has SQL millisecond precision; the first answer carried the clock value before the save.
            Assert.Equal(row.RetiredAt, again.RetiredAt);
        }

        Assert.DoesNotContain(await h.Send(new ListPoiVerificationQueueQuery(h.MapId)), item => item.ProposalId == poi.Id);
        Assert.Contains(await h.Send(new ListPoiProposalsQuery(h.MapId)), item => item.Id == poi.Id && item.RetiredAt != null);
        await Refused(() => h.Send(new CreatePoiRevisionCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), retired.CurrentRevision, retired.RowVersion,
            new(h.MapId, "Tên mới", retired.Revision.Purpose, null, retired.Revision.X, retired.Revision.Y, retired.Revision.Yaw, retired.Revision.CameraPreset)))));
        await Refused(() => h.Send(new SubmitPoiProposalCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), retired.CurrentRevision, retired.RowVersion))));
        await Refused(() => h.Send(new RecordPoiVerificationCommand(h.TechnicalId, poi.Id, retired.CurrentRevision,
            new(Guid.NewGuid(), retired.CurrentRevision, retired.RowVersion, Robot, "PASS", true, true, true, true, null, "Kiểm tra tại chỗ."))));
        await Refused(() => h.Send(new SavePoiNarrationDraftCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), draft.RowVersion, "Sửa.", null))));
        await Refused(() => h.Send(new ApprovePoiNarrationCommand(h.TechnicalId, poi.Id, draft.RevisionNumber, new(Guid.NewGuid(), draft.RowVersion))));
        await Refused(() => h.Send(new DiscardPoiNarrationCommand(h.StaffId, poi.Id, draft.RevisionNumber, new(Guid.NewGuid(), draft.RowVersion))));
        Assert.Equal("POI_RETIRED", Assert.Single((await h.Preview(File("a2.yaml", "POI_A", x: 2.5m))).Files).ErrorCode);
        var import = await Assert.ThrowsAsync<ConflictException>(() => h.Import([File("a2.yaml", "POI_A", x: 2.5m)]));
        Assert.Equal("POI_IMPORT_INVALID", import.Code);
        Assert.Equal("POI_RETIRED", (await Assert.ThrowsAsync<ConflictException>(() => h.SaveRoute(poi.Revision.Id))).Code);
        // Saved routes read as before.
        Assert.Equal(poi.Revision.Id, (await h.Send(new GetRouteRevisionQuery(route.RouteId, route.RevisionId, false))).Stops[0].PoiRevisionId);

        // A stale version is refused; reactivation lifts only the stop, and a retry returns the same result.
        var stale = await Assert.ThrowsAsync<ConflictException>(() => h.Send(
            new ReactivatePoiProposalCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), current.RowVersion))));
        Assert.Equal("STALE_VERSION", stale.Code);
        var reactivateId = Guid.NewGuid();
        var active = await h.Send(new ReactivatePoiProposalCommand(h.StaffId, poi.Id, new(reactivateId, retired.RowVersion)));
        Assert.Null(active.RetiredAt);
        Assert.True(active.CanRetire);
        Assert.Equal(active.RowVersion, (await h.Send(new ReactivatePoiProposalCommand(h.StaffId, poi.Id, new(reactivateId, retired.RowVersion)))).RowVersion);
        await using (var db = h.Context())
        {
            Assert.Equal(1, await db.AuditLogs.CountAsync(audit => audit.Action == "POI_PROPOSAL_REACTIVATED"));
            Assert.Null((await db.PoiProposals.AsNoTracking().SingleAsync(item => item.Id == poi.Id)).RetiredByUserId);
        }
        Assert.Contains(await h.Send(new ListPoiVerificationQueueQuery(h.MapId)), item => item.ProposalId == poi.Id);
        await h.Send(new SavePoiNarrationDraftCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), draft.RowVersion, "Sửa.", null)));
        await h.SaveRoute(poi.Revision.Id);
        Assert.Null(Assert.Single((await h.Preview(File("a2.yaml", "POI_A", x: 2.5m))).Files).ErrorCode);

        static async Task Refused(Func<Task> write) =>
            Assert.Equal("POI_RETIRED", (await Assert.ThrowsAsync<ConflictException>(write)).Code);
    }

    [SchemaV11Fact]
    public async Task OnlyStaffRetiresOrReactivates()
    {
        await using var h = await Harness.Create();
        var poi = await Passed(h, "POI_A", "Hội trường", 1.5m, 1.5m);
        await h.SaveRoute(poi.Revision.Id);
        await h.Database.InsertUserAsync(true, username: "import.admin", roles: ["ADMIN"]);
        await using var api = await PoiManagementEndpointTests.ApiHost.StartForDatabaseAsync(h.Database.ConnectionString);
        var body = new { requestId = Guid.NewGuid(), expectedRowVersion = poi.RowVersion };
        foreach (var username in new[] { "import.technical", "import.admin" })
        {
            var token = await Login(api.Client, username);
            Assert.Equal(HttpStatusCode.Forbidden, await Status(api.Client, $"/api/staff/poi-proposals/{poi.Id}/retire", token, body));
            Assert.Equal(HttpStatusCode.Forbidden, await Status(api.Client, $"/api/staff/poi-proposals/{poi.Id}/reactivate", token, body));
        }
        Assert.Null((await h.Send(new GetPoiProposalQuery(poi.Id))).RetiredAt);

        var staff = await Login(api.Client, "import.staff");
        Assert.Equal(HttpStatusCode.OK, await Status(api.Client, $"/api/staff/poi-proposals/{poi.Id}/retire", staff, body));
        Assert.NotNull((await h.Send(new GetPoiProposalQuery(poi.Id))).RetiredAt);

        static async Task<string> Login(HttpClient client, string username)
        {
            using var response = await client.PostAsJsonAsync("/api/auth/login", new { username, password = InitialAdminSeederTests.Password });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return json.RootElement.GetProperty("accessToken").GetString()!;
        }

        static async Task<HttpStatusCode> Status(HttpClient client, string path, string token, object body)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await client.SendAsync(request);
            return response.StatusCode;
        }
    }

    [SchemaV11Fact]
    public async Task History_ShowsAContentOnlySave_WithThePassItKept_LikeTheList()
    {
        // Before this fix a save that only changed the description read "not checked" (Bản nháp) in the history,
        // because the history took only results recorded on that exact revision.
        await using var h = await Harness.Create();
        var poi = await Passed(h, "POI_D", "POI D", 1.5m, 1.5m);
        var current = await h.Send(new GetPoiProposalQuery(poi.Id));
        current = await h.Send(new CreatePoiRevisionCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), current.CurrentRevision, current.RowVersion,
            new(h.MapId, current.Revision.Name, current.Revision.Purpose, "Mô tả mới", current.Revision.X, current.Revision.Y, current.Revision.Yaw, current.Revision.CameraPreset))));
        Assert.Equal("PASS", current.Revision.NavigationStatus);

        var history = await h.Send(new GetPoiHistoryQuery(poi.Id));
        var latest = history.Revisions.Single(revision => revision.RevisionNumber == current.CurrentRevision);
        var listed = (await h.Send(new ListPoiProposalsQuery(h.MapId))).Single(item => item.Id == poi.Id);
        Assert.Equal("PASS", latest.NavigationStatus);
        Assert.Equal(listed.Revision.NavigationStatus, latest.NavigationStatus);
        Assert.Equal(listed.Revision.VerificationSourceRevisionId, latest.VerificationSourceRevisionId);
        var checkedRevision = Assert.Single(history.VerificationRecords).ProposalRevisionId;
        Assert.Equal(checkedRevision, latest.VerificationSourceRevisionId);
        Assert.NotEqual(latest.Id, checkedRevision);
        Assert.All(history.Revisions, revision => Assert.Equal("PASS", revision.NavigationStatus));
    }

    /// <summary>A POI imported with a verified pose (PASS), named by Staff and with approved narration.</summary>
    private static async Task<PoiProposalView> Passed(Harness h, string sourceId, string name, decimal x, decimal y)
    {
        var proposalId = (await h.Import([File($"{sourceId}.yaml", sourceId, x: x, y: y)])).CreatedProposalIds[0];
        return await h.AddStaffContent(proposalId, name, $"Đây là {name}.");
    }
}
