using SmartCampus.Application.Features.Routes;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0023 addendum: the newest run of a path is the applied result of every save with that path, so a FAIL recorded on
/// a save that only changed dwell also stops the Tours on the older save, and every reader says so.
/// </summary>
public sealed class RouteTestRunCrossSaveSqlTests
{
    [SchemaV11Fact]
    public async Task AFailOnANewerSaveWithTheSamePath_AppliesToTheOlderSaveAndItsTour()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var save1 = h.Route;
        // Save 2 changes only the second stop's dwell: the same path, so it carries save 1's PASS.
        var stops = save1.Stops.OrderBy(stop => stop.StopOrder).Select(stop => new RouteRevisionStopInput(stop.PoiRevisionId,
            stop.StopOrder == 2 ? stop.DwellSeconds + 15 : stop.DwellSeconds, stop.HeadSteps)).ToArray();
        var draft = await h.Send(new SaveRouteRevisionCommand(h.StaffId, save1.RouteId, new(Guid.NewGuid(), save1.RevisionNumber,
            save1.Name, save1.Description, save1.MapVersionId, save1.StartX, save1.StartY, save1.StartYaw, save1.EndMode,
            save1.EndX, save1.EndY, save1.EndYaw, stops)));
        var save2 = await h.Send(new SubmitRouteRevisionCommand(h.StaffId, save1.RouteId, draft.RevisionId, new(Guid.NewGuid(), draft.RevisionNumber)));
        save2 = await h.Send(new GetRouteRevisionQuery(save1.RouteId, save2.RevisionId, false));
        Assert.Equal("PASS", save2.VerificationStatus);
        var sibling = Assert.Single(save2.SharedResultRevisions!);
        Assert.Equal(save1.RevisionId, sibling.RevisionId);
        Assert.Equal(h.TourId, Assert.Single(sibling.ScheduledTours).Id);
        Assert.Empty(save2.ScheduledTours!);
        // A save that already has its path's result is not waiting for a first run.
        Assert.DoesNotContain(await h.Send(new ListRouteRevisionQueueQuery()), item => item.RevisionId == save2.RevisionId);

        await h.Send(new RecordRouteTestRunCommand(h.TechnicalId, save1.RouteId, save2.RevisionId,
            new(Guid.NewGuid(), TourReadySqlTests.Robot, h.StaffId, "FAIL", false, true, true, "Kẹt ở cửa", "Chạy lại không đạt.")));

        // The Tour page reads save 1: its applied result is now the FAIL recorded on save 2, with who and why.
        var old = await h.Send(new GetRouteRevisionQuery(save1.RouteId, save1.RevisionId, false));
        Assert.Equal("FAIL", old.VerificationStatus);
        var applied = Assert.Single(old.TestRuns, run => run.Id == old.EffectiveTestRunId);
        Assert.Equal(save2.RevisionId, applied.RouteRevisionId);
        Assert.Equal("Kẹt ở cửa", applied.FailureReason);
        Assert.False(applied.AllStopsReached);
        Assert.Equal(TourReadySqlTests.Robot, applied.RobotCode);
        Assert.False(string.IsNullOrWhiteSpace(applied.CheckedByName));
        Assert.False(string.IsNullOrWhiteSpace(applied.ParticipatingStaffName));
        Assert.Equal(save2.RevisionId, Assert.Single(old.SharedResultRevisions!).RevisionId);
        Assert.Equal(h.TourId, Assert.Single(old.ScheduledTours!).Id);

        var detail = await h.Detail();
        Assert.Equal("FAIL", detail.RouteRevision!.VerificationStatus);
        Assert.Equal(applied.Id, detail.RouteRevision.EffectiveTestRunId);
        var blocker = Assert.Single(detail.Permissions.ReadyBlockers!, b => b.Code == "ROUTE_TEST_PASS_REQUIRED");
        Assert.StartsWith("Lần chạy thử mới nhất của đường đi này không đạt (", blocker.Message);
        Assert.EndsWith(": lý do Kẹt ở cửa).", blocker.Message);
        Assert.Contains(applied.CheckedAt.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM HH:mm",
            System.Globalization.CultureInfo.InvariantCulture), blocker.Message);
    }
}
