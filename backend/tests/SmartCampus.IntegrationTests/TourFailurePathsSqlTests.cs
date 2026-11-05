using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours.Commands.EndTourEarly;
using SmartCampus.Application.Features.Tours.Commands.ReconcileRobotCommand;
using SmartCampus.Application.Features.Tours.Commands.RecoverTourAfterRestart;
using SmartCampus.Application.Features.Tours.Commands.ReleaseRobotInspection;
using SmartCampus.Application.Features.Tours.Commands.RetryTourLeg;
using SmartCampus.Application.Features.Tours.Commands.SweepRobotCommand;
using SmartCampus.Domain.Entities;
using static SmartCampus.IntegrationTests.TourHappyPathSqlTests;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>End Early, Retry, Reconcile, release, the sweeper and restart (ADR-0042 §3, ADR-0043).</summary>
public sealed class TourFailurePathsSqlTests
{
    [SchemaV11Fact]
    public async Task EndEarly_WithAPendingGoTo_WithdrawsIt_AndKeepsTheRobotForInspection()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        await EndEarly(w);

        await using var db = w.H.Context();
        var tour = await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId);
        var robot = await db.Robots.AsNoTracking().SingleAsync();
        var command = await db.RobotCommands.AsNoTracking().SingleAsync();
        Assert.Equal(("CANCELLED", "Mưa lớn"), (tour.State, tour.EndReason));
        Assert.Equal(w.Clock.Now, tour.EndedAt);
        Assert.True(robot.NeedsInspection);
        Assert.Equal(tour.Id, robot.CurrentTourId);
        Assert.Equal(("EXPIRED", "WITHDRAWN", false), (command.State, command.ReasonCode, command.IsOpen));
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == "LEG_WITHDRAWN").ToArrayAsync());
    }

    [SchemaV11Fact]
    public Task EndEarly_WithADeliveredGoTo_QueuesACancelForThatLeg() => EndEarlyQueuesACancel(accepted: false);

    [SchemaV11Fact]
    public Task EndEarly_WithAnAcceptedGoTo_QueuesACancelForThatLeg() => EndEarlyQueuesACancel(accepted: true);

    private static async Task EndEarlyQueuesACancel(bool accepted)
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Delivered(w);
        if (accepted) await Result(w, goTo, "ACCEPTED");
        await EndEarly(w);

        await using var db = w.H.Context();
        var cancel = await db.RobotCommands.AsNoTracking().SingleAsync(c => c.Kind == "Cancel");
        Assert.Equal(("PENDING", goTo.LegId, (Guid?)goTo.Id, true), (cancel.State, cancel.LegId, cancel.TargetCommandId, cancel.IsOpen));
        Assert.Equal(accepted ? "ACCEPTED" : "DELIVERED", (await db.RobotCommands.AsNoTracking().SingleAsync(c => c.Id == goTo.Id)).State);
    }

    [SchemaV11Fact]
    public async Task ArrivalThatBeatsTheCancel_IsRecordedAsArrived_ClosesTheCancel_AndDoesNotReviveTheTour()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Delivered(w);
        await EndEarly(w);
        await Result(w, goTo, "TERMINAL", "ARRIVED");

        await using var db = w.H.Context();
        Assert.Equal("CANCELLED", (await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId)).State);
        Assert.Equal(("ARRIVED", "ARRIVED"), await db.RobotCommands.AsNoTracking().Where(c => c.Id == goTo.Id).Select(c => ValueTuple.Create(c.State, c.Outcome!)).SingleAsync());
        var cancel = await db.RobotCommands.AsNoTracking().SingleAsync(c => c.Kind == "Cancel");
        Assert.Equal(("EXPIRED", "LEG_ENDED", false), (cancel.State, cancel.ReasonCode, cancel.IsOpen));
    }

    [SchemaV11Fact]
    public async Task AnAcceptedCancel_ClosesWithItsGoTo_SoTheRobotCanBeReleased()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Delivered(w);
        await EndEarly(w);
        await Delivered(w);
        await using var read = w.H.Context();
        var cancel = await read.RobotCommands.AsNoTracking().SingleAsync(c => c.Kind == "Cancel");
        Assert.Equal("ACCEPTED", (await Result(w, cancel, "ACCEPTED")).CommandState);
        await Result(w, goTo, "TERMINAL", "CANCELLED");

        await using (var db = w.H.Context())
            Assert.Equal(0, await db.RobotCommands.CountAsync(c => c.IsOpen));
        await Release(w);
    }

    [SchemaV11Fact]
    public async Task EndEarly_Repeated_Concurrent_OrByAnotherStaff_HasOneEffect()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        await Delivered(w);
        var version = await w.H.Version();
        await Assert.ThrowsAsync<ForbiddenException>(() => w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.StaffId, new(Guid.NewGuid(), version, "Sai người"))));

        var errors = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => Capture(w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId,
            new(Guid.NewGuid(), version, "Mưa lớn"))))));
        Assert.Single(errors, error => error is null);
        await using var db = w.H.Context();
        Assert.Single(await db.RobotCommands.AsNoTracking().Where(c => c.Kind == "Cancel").ToArrayAsync());
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == "TOUR_ENDED_EARLY").ToArrayAsync());
        Assert.Equal("TOUR_STATE_INVALID", (await Assert.ThrowsAsync<ConflictException>(() => EndEarly(w))).Code);
    }

    [SchemaV11Fact]
    public async Task EndEarly_ReplayedWithTheSameRequestId_ReturnsTheSameResult()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var request = new EndTourEarlyRequest(Guid.NewGuid(), await w.H.Version(), "Mưa lớn");
        await w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId, request));
        await w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId, request));
        Assert.Equal("IDEMPOTENCY_CONFLICT", (await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId,
            request with { Reason = "Lý do khác" })))).Code);
    }

    [SchemaV11Fact]
    public Task Retry_AfterFailed_SendsANewLegToTheSameTarget() => RetrySendsANewLeg("FAILED");

    [SchemaV11Fact]
    public Task Retry_AfterRejected_SendsANewLegToTheSameTarget() => RetrySendsANewLeg("REJECTED");

    private static async Task RetrySendsANewLeg(string end)
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var old = await Delivered(w);
        if (end == "FAILED") await Result(w, old, "TERMINAL", "FAILED", "NAV2_ABORTED");
        else await Result(w, old, "REJECTED", reason: "BUSY");
        await w.Report();
        await Retry(w);

        var execution = (await w.H.Detail()).Execution!;
        Assert.Equal(("NORMAL", (string?)null), (execution.OperationalStatus, execution.AssistanceReason));
        var next = await Current(w);
        Assert.NotEqual(old.LegId, next.LegId);
        Assert.Equal((old.X, old.Y, old.RouteRevisionStopId, "PENDING"), (next.X, next.Y, next.RouteRevisionStopId, next.State));
        Assert.Equal(next.LegId, execution.CurrentLegId);
    }

    [SchemaV11Fact]
    public async Task Retry_NeedsExecutionIdleAndTheRightMap_SoARejectionCannotLoop()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        await Result(w, await Delivered(w), "REJECTED", reason: "BUSY");
        await w.Report(status: "NAVIGATING");
        Assert.Equal(["executionIdle"], (await Assert.ThrowsAsync<ConflictException>(() => Retry(w))).BlockedBy);
        await w.Report(mapKey: "other-map");
        Assert.Equal(["mapContextMatches"], (await Assert.ThrowsAsync<ConflictException>(() => Retry(w))).BlockedBy);
        await using var db = w.H.Context();
        Assert.Single(await db.RobotCommands.AsNoTracking().ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task Retry_IsRefused_WhileNormal_UnknownOrReconciled()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        Assert.Equal("TOUR_RETRY_NOT_ALLOWED", (await Assert.ThrowsAsync<ConflictException>(() => Retry(w))).Code);

        var goTo = await Delivered(w);
        w.Clock.Now = goTo.AcceptBy!.Value.AddSeconds(1);
        await w.Report();
        Assert.True(await w.H.Send(new SweepRobotCommandCommand(goTo.Id)));
        Assert.Equal("TOUR_RETRY_NOT_ALLOWED", (await Assert.ThrowsAsync<ConflictException>(() => Retry(w))).Code);

        await Reconcile(w, goTo.Id);
        Assert.Equal("TOUR_RETRY_NOT_ALLOWED", (await Assert.ThrowsAsync<ConflictException>(() => Retry(w))).Code);
    }

    [SchemaV11Fact]
    public async Task Reconcile_ClosesAnUnknownGoToWithoutAnOutcome_LeavingOnlyEndEarly()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Delivered(w);
        Assert.Equal("COMMAND_STATE_INVALID", (await Assert.ThrowsAsync<ConflictException>(() => Reconcile(w, goTo.Id))).Code);
        await Unknown(w, goTo);
        await Assert.ThrowsAsync<ForbiddenException>(() => w.H.Send(new ReconcileRobotCommandCommand(w.H.TourId, goTo.Id, w.H.StaffId, new(Guid.NewGuid(), "Sai người"))));
        await Assert.ThrowsAsync<NotFoundException>(() => Reconcile(w, Guid.NewGuid()));

        await Reconcile(w, goTo.Id);

        await using (var db = w.H.Context())
        {
            var command = await db.RobotCommands.AsNoTracking().SingleAsync();
            Assert.Equal(("RECONCILED", false, (string?)null, (Guid?)w.H.OperatorId, "Đã xem tại chỗ"), (command.State, command.IsOpen, command.Outcome, command.ResolvedByUserId, command.ResolutionNote));
            Assert.True((await db.Robots.AsNoTracking().SingleAsync()).NeedsInspection);
        }
        var detail = await w.H.Send(new SmartCampus.Application.Features.Tours.Queries.GetTour.GetTourQuery(w.H.TourId, w.H.OperatorId));
        Assert.Equal("NEEDS_ASSISTANCE", detail.Execution!.OperationalStatus);
        Assert.False(detail.AllowedActions!.RetryLeg.Allowed);
        Assert.False(detail.AllowedActions.Next.Allowed);
        Assert.True(detail.AllowedActions.EndEarly.Allowed);
        await EndEarly(w);
        await Release(w);
    }

    [SchemaV11Fact]
    public async Task Release_IsRefusedUntilTheTourEndedAndNoCommandIsOpen()
    {
        await using var w = await World.Create(enabled: true);
        var notHeld = await Assert.ThrowsAsync<ConflictException>(() => Release(w));
        Assert.Equal("ROBOT_NOT_HELD", notHeld.Code);

        await Start(w);
        Assert.Equal("ROBOT_TOUR_ACTIVE", (await Assert.ThrowsAsync<ConflictException>(() => Release(w))).Code);
        var goTo = await Delivered(w);
        await EndEarly(w);
        Assert.Equal("ROBOT_COMMAND_OPEN", (await Assert.ThrowsAsync<ConflictException>(() => Release(w))).Code);
        await Result(w, goTo, "TERMINAL", "CANCELLED");

        var stale = new ReleaseRobotInspectionRequest(Guid.NewGuid(), Convert.ToBase64String(new byte[8]), "Đã kiểm tra");
        var robotId = await RobotId(w);
        Assert.Equal("STALE_VERSION", (await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new ReleaseRobotInspectionCommand(robotId, w.H.TechnicalId, stale)))).Code);

        await Release(w);
        await using var db = w.H.Context();
        var robot = await db.Robots.AsNoTracking().SingleAsync();
        Assert.Equal(((Guid?)null, false), (robot.CurrentTourId, robot.NeedsInspection));
        var audit = await db.AuditLogs.AsNoTracking().SingleAsync(a => a.Action == "ROBOT_INSPECTION_RELEASED");
        Assert.Equal((w.H.TechnicalId, (Guid?)w.H.TourId), (audit.ActorUserId!.Value, audit.TourId));
    }

    [SchemaV11Fact]
    public async Task Sweeper_ExpiresAnUndeliveredGoTo_NamingTheCauseFromTelemetry()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Current(w);
        w.Clock.Now = goTo.AcceptBy;
        await w.Report();
        Assert.False(await w.H.Send(new SweepRobotCommandCommand(goTo.Id)));

        w.Clock.Now = goTo.AcceptBy!.Value.AddMilliseconds(1);
        await w.Report();
        Assert.Equal([goTo.Id], await w.H.Send(new ListDueRobotCommandsQuery()));
        Assert.True(await w.H.Send(new SweepRobotCommandCommand(goTo.Id)));
        Assert.False(await w.H.Send(new SweepRobotCommandCommand(goTo.Id)));

        var execution = (await w.H.Detail()).Execution!;
        Assert.Equal(("NEEDS_ASSISTANCE", "CommandUnknown", "EXPIRED"), (execution.OperationalStatus, execution.AssistanceReason, execution.Command!.State));
    }

    [SchemaV11Fact]
    public async Task Sweeper_WithStaleTelemetry_SaysTheRobotDisconnected()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Current(w);
        w.Clock.Now = goTo.AcceptBy!.Value.AddSeconds(1);
        await w.H.Send(new SweepRobotCommandCommand(goTo.Id));
        Assert.Equal("RobotDisconnected", (await w.H.Detail()).Execution!.AssistanceReason);
    }

    [SchemaV11Fact]
    public async Task Sweeper_MarksUnknown_AfterTheAckWindow_TheLegTimeout_OrANewStream()
    {
        await using (var w = await World.Create(enabled: true))
        {
            await Start(w);
            var goTo = await Delivered(w);
            w.Clock.Now = goTo.AcceptBy!.Value.AddSeconds(1);
            await w.Report();
            await AssertUnknown(w, goTo, "ACK_TIMEOUT");
        }
        await using (var w = await World.Create(enabled: true))
        {
            await Start(w);
            var goTo = await Delivered(w);
            await Result(w, goTo, "ACCEPTED");
            w.Clock.Now = w.Clock.Now!.Value.AddSeconds(599);
            await w.Report();
            Assert.False(await w.H.Send(new SweepRobotCommandCommand(goTo.Id)));
            w.Clock.Now = w.Clock.Now!.Value.AddSeconds(2);
            await w.Report();
            await AssertUnknown(w, goTo, "LEG_RESULT_TIMEOUT");
        }
        await using (var w = await World.Create(enabled: true))
        {
            await Start(w);
            var goTo = await Delivered(w);
            await w.RestartBridge();
            await AssertUnknown(w, goTo, "STREAM_CHANGED");
        }
    }

    [SchemaV11Fact]
    public async Task TwoSweepersAtOnce_MakeOneTransition()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Delivered(w);
        await w.RestartBridge();

        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => w.H.Send(new SweepRobotCommandCommand(goTo.Id))));

        Assert.Single(results, moved => moved);
        await using var db = w.H.Context();
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == "COMMAND_UNKNOWN").ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task Restart_InterruptsRunningTours_WithdrawsPendingGoTos_AndCreatesNothing()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        var goTo = await Current(w);

        Assert.Equal([w.H.TourId], await w.H.Send(new ListRunningToursQuery()));
        Assert.True(await w.H.Send(new RecoverTourAfterRestartCommand(w.H.TourId)));

        await using var db = w.H.Context();
        var tour = await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId);
        Assert.Equal(("RUNNING", "NEEDS_ASSISTANCE", "BackendRestarted"), (tour.State, tour.OperationalStatus, tour.AssistanceReason));
        var command = await db.RobotCommands.AsNoTracking().SingleAsync();
        Assert.Equal((goTo.Id, "EXPIRED", "BACKEND_RESTARTED"), (command.Id, command.State, command.ReasonCode));
    }

    [SchemaV11Fact]
    public async Task Restart_LeavesADeliveredCommandWaiting_AndDoesNotRestoreDwell()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await Start(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await w.H.Send(new RecoverTourAfterRestartCommand(w.H.TourId));
        Assert.Null((await w.H.Detail()).Execution!.DwellDeadlineAt);

        await using var other = await World.Create(enabled: true);
        await Start(other);
        var goTo = await Delivered(other);
        await Result(other, goTo, "ACCEPTED");
        await other.H.Send(new RecoverTourAfterRestartCommand(other.H.TourId));
        var execution = (await other.H.Detail()).Execution!;
        Assert.Equal(("NEEDS_ASSISTANCE", "ACCEPTED"), (execution.OperationalStatus, execution.Command!.State));
        // The late result is still recorded but moves nothing.
        await Result(other, goTo, "TERMINAL", "ARRIVED");
        Assert.Equal("NAVIGATING", (await other.H.Detail()).Execution!.CurrentStep);
    }

    [SchemaV11Fact]
    public async Task Restart_KeepsTheReasonOfATourAlreadyNeedingAssistance()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        await Result(w, await Delivered(w), "TERMINAL", "FAILED");
        await w.H.Send(new RecoverTourAfterRestartCommand(w.H.TourId));
        Assert.Equal("NavigationFailed", (await w.H.Detail()).Execution!.AssistanceReason);
    }

    private static async Task AssertUnknown(World w, RobotCommand goTo, string reason)
    {
        Assert.True(await w.H.Send(new SweepRobotCommandCommand(goTo.Id)));
        var execution = (await w.H.Detail()).Execution!;
        Assert.Equal(("NEEDS_ASSISTANCE", "CommandUnknown", "UNKNOWN", reason), (execution.OperationalStatus, execution.AssistanceReason, execution.Command!.State, execution.Command.ReasonCode));
        await using var db = w.H.Context();
        Assert.True((await db.RobotCommands.AsNoTracking().SingleAsync()).IsOpen);
    }

    private static async Task Unknown(World w, RobotCommand goTo)
    {
        await w.RestartBridge();
        await w.H.Send(new SweepRobotCommandCommand(goTo.Id));
    }

    private static async Task EndEarly(World w) => await w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version(), "Mưa lớn")));
    private static async Task Retry(World w) => await w.H.Send(new RetryTourLegCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version())));
    private static Task Reconcile(World w, Guid command) => w.H.Send(new ReconcileRobotCommandCommand(w.H.TourId, command, w.H.OperatorId, new(Guid.NewGuid(), "Đã xem tại chỗ")));

    private static async Task<Guid> RobotId(World w)
    {
        await using var db = w.H.Context();
        return await db.Robots.AsNoTracking().Select(r => r.Id).SingleAsync();
    }

    private static async Task Release(World w)
    {
        await using var db = w.H.Context();
        var robot = await db.Robots.AsNoTracking().SingleAsync();
        await w.H.Send(new ReleaseRobotInspectionCommand(robot.Id, w.H.TechnicalId, new(Guid.NewGuid(), Convert.ToBase64String(robot.RowVersion), "Đã kiểm tra tại chỗ")));
    }
}
