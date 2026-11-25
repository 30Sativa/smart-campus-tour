using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0067: a Tour may take newer approved narration only on a revision with its exact path.</summary>
public sealed class TourNarrationRefreshTests
{
    private static readonly Guid RouteId = Guid.NewGuid();
    private static readonly Guid MapId = Guid.NewGuid();
    private static readonly Guid PoiA = Guid.NewGuid();
    private static readonly Guid PoiB = Guid.NewGuid();

    private static RouteRevision Revision(int number, byte fingerprint = 1, bool vote = false) => new()
    {
        Id = Guid.NewGuid(), RouteId = RouteId, RevisionNumber = number, Name = $"Tuyến {number}", MapVersionId = MapId,
        MapPackageSha256 = [9], StartX = 1, StartY = 2, StartYaw = 0, EndMode = "LAST_POI",
        NavigationFingerprint = [fingerprint, 2, 3], RequestHash = [0], ViewerChoosesNextStop = vote
    };

    private static RouteRevisionStop Stop(RouteRevision revision, int order, Guid poi, int dwell = 60, string head = "LEFT",
        Guid? narration = null, string text = "cũ") => new()
    {
        Id = Guid.NewGuid(), RouteRevisionId = revision.Id, PoiProposalRevisionId = poi, StopOrder = order, DwellSeconds = dwell,
        HeadStepsJson = Route.WriteHeadSteps([new RouteHeadStep(head, 30)]), Name = $"Điểm {order}", CameraPreset = "FRONT",
        PoiNavigationFingerprint = [1], NarrationRevisionId = narration, NarrationText = text
    };

    [Fact]
    public void SamePath_IgnoresNameAndNarration_ButNotStopsDwellCameraOrFingerprint()
    {
        var a = Revision(1);
        var aStops = new[] { Stop(a, 1, PoiA), Stop(a, 2, PoiB) };
        var b = Revision(2);
        Assert.True(TourNarrationRefresh.SamePath(a, aStops, b, [Stop(b, 2, PoiB, text: "mới"), Stop(b, 1, PoiA, narration: Guid.NewGuid())]));
        Assert.False(TourNarrationRefresh.SamePath(a, aStops, b, [Stop(b, 1, PoiB), Stop(b, 2, PoiA)]));
        Assert.False(TourNarrationRefresh.SamePath(a, aStops, b, [Stop(b, 1, PoiA, dwell: 90), Stop(b, 2, PoiB)]));
        Assert.False(TourNarrationRefresh.SamePath(a, aStops, b, [Stop(b, 1, PoiA, head: "RIGHT"), Stop(b, 2, PoiB)]));
        Assert.False(TourNarrationRefresh.SamePath(a, aStops, b, [Stop(b, 1, PoiA)]));
        var c = Revision(3, fingerprint: 7);
        Assert.False(TourNarrationRefresh.SamePath(a, aStops, c, [Stop(c, 1, PoiA), Stop(c, 2, PoiB)]));
        var d = Revision(4, vote: true);
        Assert.False(TourNarrationRefresh.SamePath(a, aStops, d, [Stop(d, 1, PoiA), Stop(d, 2, PoiB)]));
    }

    [Fact]
    public void StopView_IsNewerOnlyWhenTheApprovedTextIsAnotherVersion()
    {
        var revision = Revision(1);
        var approved = new PoiNarrationRevision { Id = Guid.NewGuid(), RevisionNumber = 3, NarrationText = "Lời mới" };
        var stale = TourNarrationRefresh.StopView(Stop(revision, 1, PoiA, narration: Guid.NewGuid()), approved);
        Assert.True(stale.HasNewer);
        Assert.Equal("cũ", stale.CurrentText);
        Assert.Equal("Lời mới", stale.ApprovedText);
        Assert.Equal(3, stale.ApprovedRevisionNumber);
        Assert.False(TourNarrationRefresh.StopView(Stop(revision, 1, PoiA, narration: approved.Id), approved).HasNewer);
        Assert.False(TourNarrationRefresh.StopView(Stop(revision, 1, PoiA), null).HasNewer);
    }

    [Fact]
    public void RepeatInput_SavesTheLatestRevisionAgainInOrder()
    {
        var latest = Revision(5);
        var input = TourNarrationRefresh.RepeatInput(latest, [Stop(latest, 2, PoiB, dwell: 45), Stop(latest, 1, PoiA)], Guid.Empty);
        Assert.Equal(5, input.ExpectedCurrentRevision);
        Assert.Equal(new[] { PoiA, PoiB }, input.Stops.Select(stop => stop.PoiRevisionId));
        Assert.Equal(45, input.Stops[1].DwellSeconds);
        Assert.Equal(new[] { new RouteHeadStep("LEFT", 30) }, input.Stops[0].HeadSteps);
        Assert.Equal((latest.MapVersionId, latest.EndMode), (input.MapVersionId, input.EndMode));
    }

    [Fact]
    public void DerivedRequestIds_AreStablePerStepAndDistinct()
    {
        var request = Guid.NewGuid();
        Assert.Equal(TourNarrationRefresh.DerivedRequestId(request, "save"), TourNarrationRefresh.DerivedRequestId(request, "save"));
        Assert.NotEqual(TourNarrationRefresh.DerivedRequestId(request, "save"), TourNarrationRefresh.DerivedRequestId(request, "submit"));
        Assert.NotEqual(request, TourNarrationRefresh.DerivedRequestId(request, "save"));
    }

    [Fact]
    public void Blocker_SaysWhyARefreshCannotRun()
    {
        var revision = Revision(1);
        var stops = new[] { Stop(revision, 1, PoiA) };
        TourNarrationRefresh.Plan Plan(bool newer, bool samePath) => new(revision, stops, revision, stops, samePath, !newer, true,
            [new TourNarrationStopView(stops[0].Id, 1, "Điểm 1", "cũ", newer ? "mới" : "cũ", 2, newer)]);
        var tour = new Tour { RouteRevisionId = revision.Id };
        var open = new TourPermissions(true, true, true) { CanRefreshNarration = true };

        Assert.Null(TourNarrationRefresh.Blocker(tour, open, Plan(newer: true, samePath: true)));
        Assert.Equal(TourNarrationRefresh.UpToDateCode, TourNarrationRefresh.Blocker(tour, open, Plan(false, true))?.Code);
        Assert.Equal(TourNarrationRefresh.RouteChangedCode, TourNarrationRefresh.Blocker(tour, open, Plan(true, false))?.Code);
        Assert.Equal(TourNarrationRefresh.LockedCode,
            TourNarrationRefresh.Blocker(tour, open with { CanRefreshNarration = false }, Plan(true, true))?.Code);
        Assert.Equal(TourNarrationRefresh.LegacyCode, TourNarrationRefresh.Blocker(new Tour(), open, null)?.Code);
    }
}
