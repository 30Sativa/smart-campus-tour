using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// A save identical to the newest one is refused with ROUTE_REVISION_UNCHANGED, so the history and Technical's queue get
/// no useless row. A repeated RequestId still returns its earlier result; a name-only change saves and keeps the PASS.
/// </summary>
public sealed class RouteRevisionUnchangedSqlTests
{
    private static RouteRevisionDraftInput Copy(RouteRevisionView save, Guid requestId, string? name = null, string? description = null,
        IReadOnlyList<RouteRevisionStopInput>? stops = null) =>
        new(requestId, save.RevisionNumber, name ?? save.Name, description ?? save.Description, save.MapVersionId,
            save.StartX, save.StartY, save.StartYaw, save.EndMode, save.EndX, save.EndY, save.EndYaw,
            stops ?? save.Stops.OrderBy(stop => stop.StopOrder)
                .Select(stop => new RouteRevisionStopInput(stop.PoiRevisionId, stop.DwellSeconds, stop.HeadSteps)).ToArray());

    [SchemaV11Fact]
    public async Task AnIdenticalSave_IsRefused_ARenameSavesAndKeepsItsPass_ARepeatedRequestReturnsTheEarlierSave()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var save1 = h.Route;
        async Task<int> HistoryCount() =>
            (await h.Send(new GetRouteRevisionQuery(save1.RouteId, null, true))).RevisionHistory.Count;
        var before = await HistoryCount();

        // Same content; spaces around the name and a blank description are trimmed away as on save, so still the same.
        var copy = await Assert.ThrowsAsync<ConflictException>(() => h.Send(new SaveRouteRevisionCommand(h.StaffId, save1.RouteId,
            Copy(save1, Guid.NewGuid(), name: $"  {save1.Name} ", description: save1.Description ?? "  "))));
        Assert.Equal(SaveRouteRevisionHandler.UnchangedCode, copy.Code);
        Assert.Equal("Bản lưu này giống hệt bản đang dùng, không có gì để lưu.", copy.Message);
        Assert.Equal(before, await HistoryCount());

        // A different camera step on one stop is a change.
        var stops = save1.Stops.OrderBy(stop => stop.StopOrder).Select(stop => new RouteRevisionStopInput(stop.PoiRevisionId,
            stop.DwellSeconds, stop.StopOrder == 1 ? [new RouteHeadStep("LEFT", 1)] : stop.HeadSteps)).ToArray();
        var savedStops = await LoadStops(h, save1.RevisionId);
        var narration = savedStops.ToDictionary(stop => stop.PoiProposalRevisionId, stop => stop.NarrationRevisionId!.Value);
        var revision = await LoadRevision(h, save1.RevisionId);
        Assert.True(SaveRouteRevisionHandler.SameContent(revision, savedStops, Copy(save1, Guid.NewGuid()), narration));
        Assert.False(SaveRouteRevisionHandler.SameContent(revision, savedStops, Copy(save1, Guid.NewGuid(), stops: stops), narration));
        // A stop saved with older narration than the one approved now is not a copy: saving again takes the new wording
        // (ADR-0060; PoiImportSqlTests.PosesThatPredateTheRule_KeepTheirPass_AndContentEditsStayPossible saves it for real).
        var newer = narration.ToDictionary(pair => pair.Key, pair => pair.Key == savedStops[0].PoiProposalRevisionId ? Guid.NewGuid() : pair.Value);
        Assert.False(SaveRouteRevisionHandler.SameContent(revision, savedStops, Copy(save1, Guid.NewGuid()), newer));

        // Only the name changes: a new save, carrying the path's PASS.
        var rename = Copy(save1, Guid.NewGuid(), name: $"{save1.Name} (mới)");
        var save2 = await h.Send(new SaveRouteRevisionCommand(h.StaffId, save1.RouteId, rename));
        Assert.Equal(save1.RevisionNumber + 1, save2.RevisionNumber);
        Assert.Equal("PASS", save2.VerificationStatus);
        Assert.Equal(before + 1, await HistoryCount());

        // The same request again is a replay, not a new save, although it now matches the newest save exactly.
        var replay = await h.Send(new SaveRouteRevisionCommand(h.StaffId, save1.RouteId, rename));
        Assert.Equal(save2.RevisionId, replay.RevisionId);
        Assert.Equal(before + 1, await HistoryCount());

        // A new request with the renamed content is refused against save 2.
        var again = await Assert.ThrowsAsync<ConflictException>(() => h.Send(new SaveRouteRevisionCommand(h.StaffId, save1.RouteId,
            Copy(save2, Guid.NewGuid()))));
        Assert.Equal(SaveRouteRevisionHandler.UnchangedCode, again.Code);
    }

    private static async Task<RouteRevision> LoadRevision(TourReadySqlTests.Harness h, Guid id)
    {
        await using var db = h.Context();
        return await db.RouteRevisions.SingleAsync(r => r.Id == id);
    }

    private static async Task<RouteRevisionStop[]> LoadStops(TourReadySqlTests.Harness h, Guid revisionId)
    {
        await using var db = h.Context();
        return await db.RouteRevisionStops.Where(s => s.RouteRevisionId == revisionId).ToArrayAsync();
    }
}
