using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours.Commands.MarkTourReady;
using SmartCampus.Application.Features.Tours.Commands.NextTourStop;
using SmartCampus.Application.Features.Tours.Commands.ReportCommandResult;
using SmartCampus.Application.Features.Tours.Commands.StartTour;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Domain.Entities;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>Start, leg results, Next and completion through the Application handlers (ADR-0042, ADR-0043). No robot endpoint yet.</summary>
public sealed class TourHappyPathSqlTests
{
    private static readonly Guid Stream = Guid.NewGuid();

    [SchemaV11Fact]
    public async Task Start_ClaimsTheRobot_RunsTheTour_AndLeavesOnePendingGoToWithEventsAndReceipt()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await Start(w);

        await using var db = w.H.Context();
        var tour = await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId);
        var robot = await db.Robots.AsNoTracking().SingleAsync();
        var first = await db.RouteRevisionStops.AsNoTracking().Where(s => s.RouteRevisionId == w.H.Route.RevisionId).OrderBy(s => s.StopOrder).FirstAsync();
        var map = await db.MapVersions.AsNoTracking().SingleAsync();
        var command = await db.RobotCommands.AsNoTracking().SingleAsync();

        Assert.Equal(("RUNNING", "NORMAL", "NAVIGATING", "TO_POI"), (tour.State, tour.OperationalStatus, tour.CurrentStep, tour.CurrentLegKind));
        Assert.Equal(w.Clock.Now, tour.StartedAt);
        Assert.Equal(robot.Id, tour.AssignedRobotId);
        Assert.Equal(first.Id, tour.CurrentRevisionStopId);
        Assert.Null(tour.CurrentRouteStopId);
        Assert.Equal(tour.Id, robot.CurrentTourId);
        Assert.Equal(w.Clock.Now, robot.LastAssignedAt);

        Assert.Equal((RobotCommandKinds.GoTo, RobotCommandStates.Pending, true), (command.Kind, command.State, command.IsOpen));
        Assert.Equal((tour.CurrentLegId, RobotLegKinds.ToPoi, (Guid?)first.Id), (command.LegId, command.LegKind, command.RouteRevisionStopId));
        Assert.Equal((map.MapKey, "map", first.X, first.Y, first.Yaw), (command.MapKey, command.FrameId, command.X!.Value, command.Y!.Value, command.Yaw!.Value));
        Assert.Equal(w.Clock.Now!.Value.AddSeconds(30), command.AcceptBy);
        Assert.Equal(w.H.OperatorId, command.IssuedByUserId);

        var events = await db.TourEvents.AsNoTracking().Where(e => e.TourId == tour.Id).OrderBy(e => e.Id).ToArrayAsync();
        Assert.Equal(["TOUR_READY", "TOUR_STARTED", "LEG_DISPATCH_REQUESTED"], events.Select(e => e.EventType));
        var dispatch = events[^1];
        Assert.Equal((command.Id, command.LegId, first.StopOrder, map.MapKey, first.X), (dispatch.CommandId!.Value, dispatch.LegId!.Value, dispatch.TargetStopOrder!.Value, dispatch.TargetMapKey, dispatch.TargetX!.Value));
        Assert.Single(await db.AuditLogs.AsNoTracking().Where(a => a.Action == "TOUR_STARTED" && a.ActorUserId == w.H.OperatorId).ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task Start_RepeatedWithTheSameRequestId_ReturnsTheSameResult_AndCreatesNoSecondCommand()
    {
        await using var w = await World.Create(enabled: true);
        var request = new StartTourRequest(Guid.NewGuid(), await w.H.Version(), new(true, true, true, true));
        var first = await w.H.Send(new StartTourCommand(w.H.TourId, w.H.OperatorId, request));
        var second = await w.H.Send(new StartTourCommand(w.H.TourId, w.H.OperatorId, request));

        Assert.Equal(first, second);
        await using var db = w.H.Context();
        Assert.Single(await db.RobotCommands.AsNoTracking().ToArrayAsync());
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == "TOUR_STARTED").ToArrayAsync());
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new StartTourCommand(w.H.TourId, w.H.OperatorId,
            request with { Confirmation = new(true, true, true, null) })))).Code);
    }

    [SchemaV11Fact]
    public async Task ConcurrentStarts_HaveExactlyOneWinner()
    {
        await using var w = await World.Create(enabled: true);
        var version = await w.H.Version();
        var errors = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => Capture(w.H.Send(new StartTourCommand(w.H.TourId, w.H.OperatorId,
            new(Guid.NewGuid(), version, new(true, true, true, true)))))));

        Assert.Single(errors, error => error is null);
        Assert.All(errors.Where(error => error is not null), error => Assert.IsType<ConflictException>(error));
        await using var db = w.H.Context();
        Assert.Single(await db.RobotCommands.AsNoTracking().ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task TwoToursStartingOnTheSameRobot_OnlyOneClaimsIt()
    {
        await using var w = await World.Create(enabled: true);
        var now = w.Clock.Now;
        w.Clock.Now = null;
        var other = await w.H.Send(new GetTourQuery(w.OtherTourId));
        await w.H.Send(new MarkTourReadyCommand(w.OtherTourId, w.H.StaffId, new(Guid.NewGuid(), other.Tour.RowVersion)));
        await w.H.Database.ExecuteAsync($"UPDATE dbo.Tours SET ScheduledStartAt = '{w.H.Start:O}' WHERE Id = '{w.OtherTourId}';");
        w.Clock.Now = now;
        var versions = new[] { await w.H.Version(), (await w.H.Send(new GetTourQuery(w.OtherTourId))).Tour.RowVersion };
        var tours = new[] { w.H.TourId, w.OtherTourId };

        var errors = await Task.WhenAll(tours.Select((tour, index) => Capture(w.H.Send(new StartTourCommand(tour, w.H.OperatorId,
            new(Guid.NewGuid(), versions[index], new(true, true, true, true)))))));

        Assert.Single(errors, error => error is null);
        Assert.IsType<ConflictException>(Assert.Single(errors, error => error is not null));
        await using var db = w.H.Context();
        Assert.Single(await db.Tours.AsNoTracking().Where(t => t.State == "RUNNING").ToArrayAsync());
        Assert.Single(await db.RobotCommands.AsNoTracking().ToArrayAsync());
        Assert.NotNull((await db.Robots.AsNoTracking().SingleAsync()).CurrentTourId);
    }

    [SchemaV11Fact]
    public async Task Accepted_MovesOnlyTheCommand_AndAnExactRepeatIsADuplicate()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var command = await Delivered(w);
        var at = w.Clock.Now!.Value;

        var ack = await Result(w, command, "ACCEPTED", reportedAt: at);
        Assert.Equal(new CommandResultAck(true, false, "ACCEPTED"), ack);
        Assert.Equal(new CommandResultAck(true, true, "ACCEPTED"), await Result(w, command, "ACCEPTED", reportedAt: at));

        Assert.Equal("RESULT_CONFLICT", (await Refused(w, command, "ACCEPTED", reportedAt: at.AddSeconds(1))).Code);
        await using var db = w.H.Context();
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == "LEG_ACCEPTED" && e.CommandId == command.Id).ToArrayAsync());
        Assert.Equal("NAVIGATING", (await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId)).CurrentStep);
    }

    [SchemaV11Fact]
    public async Task ArrivedAtAPoi_StartsObserving_WithoutLeavingWhenTheDwellEnds()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await Start(w);
        var command = await Delivered(w);
        await Result(w, command, "ACCEPTED");
        await Result(w, command, "TERMINAL", "ARRIVED");

        await using var db = w.H.Context();
        var tour = await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId);
        var stored = await db.RobotCommands.AsNoTracking().SingleAsync();
        Assert.Equal(("OBSERVING", command.RouteRevisionStopId), (tour.CurrentStep, tour.LastArrivedRevisionStopId));
        Assert.NotNull(tour.CurrentStopVisitId);
        Assert.Null(tour.StopVisitClosedAt);
        Assert.Equal(w.Clock.Now!.Value.AddSeconds(30), tour.DwellDeadlineAt);
        Assert.Equal(("ARRIVED", "ARRIVED", false), (stored.State, stored.Outcome, stored.IsOpen));
        // D12: time passing alone changes nothing.
        w.Clock.Now = w.Clock.Now.Value.AddHours(1);
        Assert.Equal("OBSERVING", (await w.H.Detail()).Execution!.CurrentStep);
    }

    [SchemaV11Fact]
    public async Task ImplicitAcceptance_ATerminalResultWithoutAcceptedIsValid()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var command = await Delivered(w);
        Assert.Equal("ARRIVED", (await Result(w, command, "TERMINAL", "ARRIVED")).CommandState);
    }

    [SchemaV11Fact]
    public async Task Failed_NeedsAssistance_AndCannotBeTurnedIntoArrived()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var command = await Delivered(w);
        await Result(w, command, "TERMINAL", "FAILED", "NAV2_ABORTED");

        var execution = (await w.H.Detail()).Execution!;
        Assert.Equal(("NEEDS_ASSISTANCE", "NavigationFailed", "NAVIGATING"), (execution.OperationalStatus, execution.AssistanceReason, execution.CurrentStep));
        Assert.Equal("RESULT_CONFLICT", (await Refused(w, command, "TERMINAL", "ARRIVED")).Code);
        await using var db = w.H.Context();
        Assert.Equal("NAV2_ABORTED", (await db.RobotCommands.AsNoTracking().SingleAsync()).ReasonCode);
    }

    [SchemaV11Fact]
    public async Task Rejected_NeedsAssistanceWithItsOwnReason_AndKeepsTheRobotsReasonInTheEvent()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var command = await Delivered(w);
        Assert.Equal("REJECTED", (await Result(w, command, "REJECTED", reason: "MAP_MISMATCH")).CommandState);

        var execution = (await w.H.Detail()).Execution!;
        Assert.Equal(("NEEDS_ASSISTANCE", "CommandRejected"), (execution.OperationalStatus, execution.AssistanceReason));
        await using var db = w.H.Context();
        Assert.Equal("MAP_MISMATCH", (await db.TourEvents.AsNoTracking().SingleAsync(e => e.EventType == "LEG_REJECTED")).ReasonCode);
        var stored = await db.RobotCommands.AsNoTracking().SingleAsync();
        Assert.Equal(("REJECTED", false, "MAP_MISMATCH"), (stored.State, stored.IsOpen, stored.ReasonCode));
    }

    [SchemaV11Fact]
    public async Task InvalidResults_AreRefused_AndChangeNothing()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var pending = await Current(w);
        Assert.Equal("RESULT_PHASE_NOT_ALLOWED", (await Refused(w, pending, "ACCEPTED")).Code);

        var command = await Delivered(w);
        Assert.Equal("RESULT_STREAM_MISMATCH", (await Refused(w, command, "ACCEPTED", stream: Guid.NewGuid())).Code);
        Assert.Equal("RESULT_CONFLICT", (await Refused(w, command, "ACCEPTED", leg: Guid.NewGuid())).Code);
        await Assert.ThrowsAsync<NotFoundException>(() => w.H.Send(new ReportCommandResultCommand("another_robot", command.Id, command.LegId, Stream, "ACCEPTED", null, null, w.Clock.Now!.Value)));
        await Assert.ThrowsAsync<NotFoundException>(() => w.H.Send(new ReportCommandResultCommand(TourReadySqlTests.Robot, Guid.NewGuid(), command.LegId, Stream, "ACCEPTED", null, null, w.Clock.Now!.Value)));

        await Result(w, command, "ACCEPTED");
        Assert.Equal("RESULT_PHASE_NOT_ALLOWED", (await Refused(w, command, "REJECTED", reason: "BUSY")).Code);
        await using var db = w.H.Context();
        Assert.Equal("ACCEPTED", (await db.RobotCommands.AsNoTracking().SingleAsync()).State);
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.CommandId == command.Id && e.EventType.StartsWith("LEG_") && e.EventType != "LEG_DISPATCH_REQUESTED").ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task AResultForAnOlderLeg_IsRecorded_AndDoesNotMoveTheTour()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await Start(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await Next(w);
        var current = await Delivered(w);
        // The Tour has moved on to another leg, as after a retry.
        await w.H.Database.ExecuteAsync($"UPDATE dbo.Tours SET CurrentLegId = NEWID() WHERE Id = '{w.H.TourId}';");
        var before = (await w.H.Detail()).Execution!;

        await Result(w, current, "TERMINAL", "ARRIVED");

        var after = (await w.H.Detail()).Execution!;
        Assert.Equal((before.CurrentStep, before.OperationalStatus, before.LastArrivedRevisionStopId), (after.CurrentStep, after.OperationalStatus, after.LastArrivedRevisionStopId));
        await using var db = w.H.Context();
        var recorded = await db.TourEvents.AsNoTracking().SingleAsync(e => e.EventType == "LEG_TERMINAL" && e.CommandId == current.Id);
        Assert.Contains("\"applied\":false", recorded.DataJson);
        Assert.Equal("ARRIVED", (await db.RobotCommands.AsNoTracking().SingleAsync(c => c.Id == current.Id)).State);
    }

    [SchemaV11Fact]
    public async Task LateTerminalOnAnUnknownCommand_IsRecorded_AndDoesNotAdvanceTheTour()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var command = await Delivered(w);
        await w.H.Database.ExecuteAsync($"UPDATE dbo.RobotCommands SET State='UNKNOWN', CompletedAt=SYSDATETIMEOFFSET() WHERE Id='{command.Id}';");

        Assert.Equal("UNKNOWN", (await Result(w, command, "ACCEPTED")).CommandState);
        Assert.Equal("ARRIVED", (await Result(w, command, "TERMINAL", "ARRIVED")).CommandState);

        Assert.Equal("NAVIGATING", (await w.H.Detail()).Execution!.CurrentStep);
    }

    [SchemaV11Fact]
    public async Task Next_GoesToTheNextPoi_ClosingTheVisitOnce()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await Start(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await Next(w);

        await using var db = w.H.Context();
        var tour = await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId);
        var second = await db.RouteRevisionStops.AsNoTracking().Where(s => s.RouteRevisionId == w.H.Route.RevisionId).OrderBy(s => s.StopOrder).Skip(1).FirstAsync();
        var command = await db.RobotCommands.AsNoTracking().SingleAsync(c => c.IsOpen);
        Assert.Equal(("NAVIGATING", "TO_POI", (Guid?)second.Id), (tour.CurrentStep, tour.CurrentLegKind, tour.CurrentRevisionStopId));
        Assert.Equal(w.Clock.Now, tour.StopVisitClosedAt);
        Assert.Null(tour.DwellDeadlineAt);
        Assert.Equal((tour.CurrentLegId, second.X, second.Y), (command.LegId, command.X!.Value, command.Y!.Value));
        Assert.Equal(2, await db.RobotCommands.CountAsync());
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == "VISIT_CLOSED").ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task Next_FromTheLastPoi_GoesToTheEndPose_ThenArrivalCompletesAndReleases()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await Start(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await Next(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await Next(w);

        var toEnd = await Current(w);
        Assert.Equal((RobotLegKinds.ToEnd, (Guid?)null, 1.5m, 2.5m), (toEnd.LegKind, toEnd.RouteRevisionStopId, toEnd.X!.Value, toEnd.Y!.Value));
        var execution = (await w.H.Detail()).Execution!;
        Assert.Equal(("RETURNING_TO_END", "TO_END", (Guid?)null), (execution.CurrentStep, execution.CurrentLegKind, execution.CurrentRevisionStopId));

        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await AssertCompletedAndReleased(w);
    }

    [SchemaV11Fact]
    public async Task Next_AtTheLastPoi_OfALastPoiRoute_CompletesAndReleases_WithoutACommandOrMovementChecks()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        w.Clock.Now = w.Clock.Now!.Value.AddMinutes(5); // Telemetry is stale, which only matters for a new command.
        await w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version())));

        await AssertCompletedAndReleased(w);
        await using var db = w.H.Context();
        Assert.Single(await db.RobotCommands.AsNoTracking().ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task ARobotNeedingInspection_IsNotReleasedByANormalEnd()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await w.H.Database.ExecuteAsync("UPDATE dbo.Robots SET NeedsInspection = 1;");
        await Next(w);

        await using var db = w.H.Context();
        Assert.Equal("COMPLETED", (await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId)).State);
        Assert.Equal(w.H.TourId, (await db.Robots.AsNoTracking().SingleAsync()).CurrentTourId);
    }

    [SchemaV11Fact]
    public async Task Next_IsRefusedWithoutMovementConditions_OrAnOpenCommand_OrByAnotherStaff()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await Start(w);
        var version = await w.H.Version();
        Assert.Equal("TOUR_STATE_INVALID", (await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId,
            new(Guid.NewGuid(), version))))).Code);

        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        version = await w.H.Version();
        await Assert.ThrowsAsync<ForbiddenException>(() => w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.StaffId, new(Guid.NewGuid(), version))));
        Assert.Equal("STALE_VERSION", (await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId,
            new(Guid.NewGuid(), Convert.ToBase64String(new byte[8])))))).Code);

        w.Clock.Now = w.Clock.Now!.Value.AddSeconds(3);
        var stale = await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), version))));
        Assert.Equal(("MOVE_PRECONDITION_FAILED", (string?)"telemetryFresh"), (stale.Code, stale.BlockedBy!.Single()));

        await w.Report(status: "NAVIGATING");
        Assert.Equal(["executionIdle"], (await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId,
            new(Guid.NewGuid(), version))))).BlockedBy);

        await w.Report();
        w.Console.Connected = null;
        Assert.Equal(["operatorConsoleConnected"], (await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId,
            new(Guid.NewGuid(), version))))).BlockedBy);
        w.Console.Connected = true;

        // Another open command on the robot, even from data that disagrees, stops the Tour from adding a second one.
        await w.H.Database.ExecuteAsync("""
            INSERT dbo.RobotCommands(Id,RobotId,TourId,LegId,LegKind,Kind,State,IsOpen,MapKey,FrameId,X,Y,Yaw,IssuedAt,AcceptBy)
            SELECT TOP (1) NEWID(),RobotId,TourId,NEWID(),'TO_END','GoTo','PENDING',1,MapKey,FrameId,X,Y,Yaw,IssuedAt,AcceptBy FROM dbo.RobotCommands;
            """);
        Assert.Equal("TOUR_COMMAND_OPEN", (await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId,
            new(Guid.NewGuid(), version))))).Code);
        await using var db = w.H.Context();
        Assert.Null((await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId)).StopVisitClosedAt);
    }

    [SchemaV11Fact]
    public async Task Next_RepeatedOrConcurrent_CreatesOneCommand()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await Start(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await w.Report();
        var request = new NextTourStopRequest(Guid.NewGuid(), await w.H.Version());
        await w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId, request));
        await w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId, request));
        await using (var db = w.H.Context())
            Assert.Equal(2, await db.RobotCommands.CountAsync());

        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await w.Report();
        var version = await w.H.Version();
        var errors = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => Capture(w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId,
            new(Guid.NewGuid(), version))))));
        Assert.Single(errors, error => error is null);
        await using var after = w.H.Context();
        Assert.Equal(3, await after.RobotCommands.CountAsync());
        Assert.Equal(2, await after.TourEvents.CountAsync(e => e.EventType == "VISIT_CLOSED"));
    }

    [SchemaV11Fact]
    public async Task AWholeTourOfTwoPois_RunsThroughTheHandlers_AndReleasesTheRobot()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await Start(w);
        foreach (var _ in new[] { "first POI", "second POI" })
        {
            var leg = await Delivered(w);
            await Result(w, leg, "ACCEPTED");
            await Result(w, leg, "TERMINAL", "ARRIVED");
            await Next(w);
        }
        var end = await Delivered(w);
        await Result(w, end, "ACCEPTED");
        await Result(w, end, "TERMINAL", "ARRIVED");

        await AssertCompletedAndReleased(w);
        await using var db = w.H.Context();
        Assert.Equal(3, await db.RobotCommands.CountAsync());
        Assert.Equal(0, await db.RobotCommands.CountAsync(c => c.IsOpen));
        Assert.Equal(["TOUR_READY", "TOUR_STARTED", "LEG_DISPATCH_REQUESTED", "LEG_ACCEPTED", "LEG_TERMINAL", "VISIT_CLOSED", "LEG_DISPATCH_REQUESTED",
                "LEG_ACCEPTED", "LEG_TERMINAL", "VISIT_CLOSED", "LEG_DISPATCH_REQUESTED", "LEG_ACCEPTED", "LEG_TERMINAL", "TOUR_COMPLETED"],
            await db.TourEvents.AsNoTracking().Where(e => e.TourId == w.H.TourId).OrderBy(e => e.Id).Select(e => e.EventType).ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task Detail_ShowsExecution_AndAllowedActionsForTheCaller()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        var ready = await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId));
        Assert.True(ready.AllowedActions!.Start.Allowed);
        Assert.False(ready.AllowedActions.Next.Allowed);
        Assert.Null(ready.Execution!.CurrentLegId);
        var other = await w.H.Send(new GetTourQuery(w.H.TourId, w.H.StaffId));
        Assert.Equal(["callerIsOperator"], other.AllowedActions!.Start.BlockedBy);

        await Start(w);
        var running = await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId));
        Assert.False(running.AllowedActions!.Start.Allowed);
        Assert.Equal(("NAVIGATING", "PENDING"), (running.Execution!.CurrentStep, running.Execution.Command!.State));

        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await w.Report();
        var observing = await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId));
        Assert.True(observing.AllowedActions!.Next.Allowed);
        Assert.NotNull(observing.Execution!.DwellDeadlineAt);
        Assert.Equal(["callerIsOperator"], (await w.H.Send(new GetTourQuery(w.H.TourId, w.H.StaffId))).AllowedActions!.Next.BlockedBy);
    }

    private static async Task AssertCompletedAndReleased(World w)
    {
        await using var db = w.H.Context();
        var tour = await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId);
        Assert.Equal("COMPLETED", tour.State);
        Assert.Equal(w.Clock.Now, tour.EndedAt);
        Assert.NotNull(tour.AssignedRobotId);
        Assert.Null((await db.Robots.AsNoTracking().SingleAsync()).CurrentTourId);
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == "TOUR_COMPLETED").ToArrayAsync());
    }

    private static async Task Start(World w) => await w.H.Send(new StartTourCommand(w.H.TourId, w.H.OperatorId,
        new(Guid.NewGuid(), await w.H.Version(), new(true, true, true, true))));

    private static async Task Next(World w)
    {
        await w.Report();
        await w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version())));
    }

    private static async Task<RobotCommand> Current(World w)
    {
        await using var db = w.H.Context();
        return await db.RobotCommands.AsNoTracking().OrderByDescending(c => c.IsOpen).ThenByDescending(c => c.IssuedAt).FirstAsync();
    }

    /// <summary>Stands in for the poll of PR-D: the open GoTo reaches <see cref="Stream"/>.</summary>
    private static async Task<RobotCommand> Delivered(World w)
    {
        await w.H.Database.ExecuteAsync($"UPDATE dbo.RobotCommands SET State='DELIVERED', DeliveredAt=SYSDATETIMEOFFSET(), DeliveredStreamId='{Stream}' WHERE State='PENDING';");
        return await Current(w);
    }

    private static Task<CommandResultAck> Result(World w, RobotCommand command, string phase, string? outcome = null, string? reason = null,
        DateTimeOffset? reportedAt = null, Guid? stream = null, Guid? leg = null) =>
        w.H.Send(new ReportCommandResultCommand(TourReadySqlTests.Robot, command.Id, leg ?? command.LegId, stream ?? Stream, phase, outcome, reason,
            reportedAt ?? w.Clock.Now!.Value));

    private static Task<ConflictException> Refused(World w, RobotCommand command, string phase, string? outcome = null, string? reason = null,
        DateTimeOffset? reportedAt = null, Guid? stream = null, Guid? leg = null) =>
        Assert.ThrowsAsync<ConflictException>(() => Result(w, command, phase, outcome, reason, reportedAt, stream, leg));

    private static async Task<Exception?> Capture(Task task)
    {
        try { await task; return null; }
        catch (Exception error) { return error; }
    }
}
