using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.EndTourEarly;
using SmartCampus.Application.Features.Tours.Commands.ReconcileRobotCommand;
using SmartCampus.Application.Features.Tours.Commands.SweepRobotCommand;
using SmartCampus.Application.Features.Tours.Queries.GetTours;
using static SmartCampus.IntegrationTests.TourHappyPathSqlTests;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>The read-only execution summary on Tour list rows: the same values the detail shows, from one list query.</summary>
public sealed class TourListExecutionSqlTests
{
    [SchemaV11Fact]
    public async Task ARunningTour_ShowsItsStepAndCurrentCommand_AndANotStartedTourShowsNone()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);

        var rows = await List(w);
        var running = rows.Single(t => t.Id == w.H.TourId).Execution!;
        Assert.Equal(new TourExecutionSummary("NORMAL", null, "NAVIGATING", "PENDING", false), running);
        await AssertMatchesDetail(w, running);
        Assert.Equal(new TourExecutionSummary(null, null, null, null, false), rows.Single(t => t.Id == w.OtherTourId).Execution);
    }

    [SchemaV11Fact]
    public async Task ATourNeedingAssistance_ShowsTheReasonAndTheFailedCommand()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Delivered(w);
        await Result(w, goTo, "TERMINAL", "FAILED", "NAV2_ABORTED");

        var row = (await List(w, TourPhases.Running)).Single();
        Assert.Equal(("RUNNING", "NEEDS_ASSISTANCE", "NavigationFailed", "FAILED", false),
            (row.State, row.Execution!.OperationalStatus, row.Execution.AssistanceReason, row.Execution.CommandState, row.Execution.NeedsReconcile));
        await AssertMatchesDetail(w, row.Execution);
    }

    [SchemaV11Fact]
    public async Task ACancelledTourWithAnUnknownGoTo_NeedsReconcile_UntilItIsReconciled()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Delivered(w);
        await w.RestartBridge();
        Assert.True(await w.H.Send(new SweepRobotCommandCommand(goTo.Id)));
        await w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version(), "Mưa lớn")));

        var row = (await List(w, TourPhases.Finished)).Single(t => t.Id == w.H.TourId);
        Assert.Equal(("CANCELLED", "UNKNOWN", true), (row.State, row.Execution!.CommandState, row.Execution.NeedsReconcile));
        await AssertMatchesDetail(w, row.Execution);
        Assert.Empty(await List(w, TourPhases.Running));

        await w.H.Send(new ReconcileRobotCommandCommand(w.H.TourId, goTo.Id, w.H.OperatorId, new(Guid.NewGuid(), "Đã xem tại chỗ")));
        var reconciled = (await List(w, TourPhases.Finished)).Single(t => t.Id == w.H.TourId).Execution!;
        Assert.Equal(("RECONCILED", false), (reconciled.CommandState, reconciled.NeedsReconcile));
    }

    private static async Task<IReadOnlyCollection<TourSummary>> List(World w, string? phase = null) =>
        (await w.H.Send(new GetToursQuery(new(null, "scheduledStartAt", 1, 100, null, null, null, phase)))).Items;

    private static async Task AssertMatchesDetail(World w, TourExecutionSummary summary)
    {
        var detail = await w.H.Detail();
        var execution = detail.Execution!;
        Assert.Equal((execution.OperationalStatus, execution.AssistanceReason, execution.CurrentStep, execution.Command?.State),
            (summary.OperationalStatus, summary.AssistanceReason, summary.CurrentStep, summary.CommandState));
        Assert.Equal(summary, detail.Tour.Execution);
    }
}
