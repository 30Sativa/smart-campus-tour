using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.EndTourEarly;
using SmartCampus.Application.Features.Tours.Commands.ReconcileRobotCommand;
using SmartCampus.Application.Features.Tours.Commands.SweepRobotCommand;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
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

        // The server-side filter finds it without scanning the finished list.
        Assert.Equal([w.H.TourId], (await List(w, request: r => r with { NeedsReconcile = true })).Select(t => t.Id));

        await w.H.Send(new ReconcileRobotCommandCommand(w.H.TourId, goTo.Id, w.H.OperatorId, new(Guid.NewGuid(), "Đã xem tại chỗ")));
        var reconciled = (await List(w, TourPhases.Finished)).Single(t => t.Id == w.H.TourId).Execution!;
        Assert.Equal(("RECONCILED", false), (reconciled.CommandState, reconciled.NeedsReconcile));
        Assert.Empty(await List(w, request: r => r with { NeedsReconcile = true }));
    }

    [SchemaV11Fact]
    public async Task ListRows_CarryTheAssignedOperator_AndTheOperatorFilterKeepsOnlyTheirTours()
    {
        await using var w = await World.Create(enabled: true);

        var row = (await List(w)).Single(t => t.Id == w.H.TourId);
        Assert.Equal(w.H.OperatorId, row.Operator!.UserId);
        Assert.Equal((await w.H.Detail()).Operator, row.Operator);
        Assert.Contains(w.H.TourId, (await List(w, request: r => r with { OperatorUserId = w.H.OperatorId })).Select(t => t.Id));
        Assert.Empty(await List(w, request: r => r with { OperatorUserId = Guid.NewGuid() }));
    }

    [SchemaV11Fact]
    public async Task ReadyBlockers_AreTheDetailsBlockers_OnlyForScheduledRows_AndOnlyWhenAsked()
    {
        await using var w = await World.Create(enabled: true);

        Assert.All(await List(w), t => Assert.Null(t.ReadyBlockers));
        var rows = await List(w, request: r => r with { Size = 10, IncludeReadyBlockers = true });
        Assert.Null(rows.Single(t => t.Id == w.H.TourId).ReadyBlockers); // READY: nothing to make READY.
        var scheduled = rows.Single(t => t.Id == w.OtherTourId);
        Assert.Equal("SCHEDULED", scheduled.State);
        var detail = await w.H.Send(new GetTourQuery(w.OtherTourId, w.H.OperatorId));
        Assert.Equal(detail.Permissions.ReadyBlockers!.Select(b => b.Code), scheduled.ReadyBlockers!.Select(b => b.Code));
    }

    [Fact]
    public void ReadyBlockers_AreRefusedOnALongPage()
    {
        var request = new TourListRequest(null, "scheduledStartAt", 1, GetToursQueryValidator.MaxReadyBlockerPage, null, null, null, IncludeReadyBlockers: true);
        var validator = new GetToursQueryValidator();
        Assert.True(validator.Validate(new GetToursQuery(request)).IsValid);
        Assert.False(validator.Validate(new GetToursQuery(request with { Size = GetToursQueryValidator.MaxReadyBlockerPage + 1 })).IsValid);
    }

    private static async Task<IReadOnlyCollection<TourSummary>> List(World w, string? phase = null, Func<TourListRequest, TourListRequest>? request = null)
    {
        var query = new TourListRequest(null, "scheduledStartAt", 1, 100, null, null, null, phase);
        return (await w.H.Send(new GetToursQuery(request is null ? query : request(query)))).Items;
    }

    private static async Task AssertMatchesDetail(World w, TourExecutionSummary summary)
    {
        var detail = await w.H.Detail();
        var execution = detail.Execution!;
        Assert.Equal((execution.OperationalStatus, execution.AssistanceReason, execution.CurrentStep, execution.Command?.State),
            (summary.OperationalStatus, summary.AssistanceReason, summary.CurrentStep, summary.CommandState));
        Assert.Equal(summary, detail.Tour.Execution);
    }
}
