using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.AutoAdvanceTour;
using SmartCampus.Application.Features.Tours.Commands.EndTourEarly;
using SmartCampus.Application.Features.Tours.Commands.NextTourStop;
using SmartCampus.Application.Features.Tours.Commands.PauseTourLeg;
using SmartCampus.Application.Features.Tours.Commands.PollRobotCommand;
using SmartCampus.Application.Features.Tours.Commands.RetryTourLeg;
using SmartCampus.Application.Features.Tours.Commands.SkipTourStop;
using SmartCampus.Application.Features.Tours.Commands.StartTour;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Application.Features.Tours.Queries.GetTourStartChecks;
using SmartCampus.Domain.Entities;
using static SmartCampus.IntegrationTests.TourHappyPathSqlTests;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// The demo flow: open the Tour without its first leg, depart with the on-site confirmations, pause and resume a leg,
/// skip a POI, end while the robot stands still, and the automatic departure at a POI.
/// </summary>
public sealed class TourDemoFlowSqlTests
{
    private static readonly TourStartConfirmation Confirmed = new(true, true, true, true);

    [SchemaV11Fact]
    public async Task Open_RunsTheTourAtTheStart_WithoutACommand_EvenBeforeTheRobotIsLocalized()
    {
        await using var w = await World.Create(enabled: true);
        await w.Report(localized: false, motionReady: false);
        var checks = await w.H.Send(new GetTourStartChecksQuery(w.H.TourId, w.H.OperatorId, HoldAtStart: true));
        Assert.True(checks.CanStart, string.Join(',', checks.BlockedBy));

        await Open(w);

        await using var db = w.H.Context();
        var tour = await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId);
        Assert.Equal(("RUNNING", "NORMAL", TourRuntime.Initializing, (Guid?)null), (tour.State, tour.OperationalStatus, tour.CurrentStep, tour.CurrentLegId));
        Assert.Equal(0, await db.RobotCommands.CountAsync());
        Assert.Equal((Guid?)w.H.TourId, (await db.Robots.AsNoTracking().SingleAsync()).CurrentTourId);
    }

    [SchemaV11Fact]
    public async Task Depart_NeedsTheOnSiteConfirmations_AndTheMovementChecks_ThenSendsTheFirstLeg()
    {
        await using var w = await World.Create(enabled: true);
        await Open(w);

        var unconfirmed = await Assert.ThrowsAsync<ConflictException>(() => Depart(w, null));
        Assert.Equal(TourStartPreflight.MovementFailedCode, unconfirmed.Code);
        Assert.Equal(["robotPlaced", "areaClear", "attendantPresent", "previewChecked"], unconfirmed.BlockedBy);

        await w.Report(localized: false);
        Assert.Equal(["robotLocalized"], (await Assert.ThrowsAsync<ConflictException>(() => Depart(w, Confirmed))).BlockedBy);

        await w.Report();
        await Depart(w, Confirmed);
        var detail = await w.H.Detail();
        Assert.Equal((TourRuntime.Navigating, detail.RouteRevision!.Stops[0].Id), (detail.Execution!.CurrentStep, detail.Execution.CurrentRevisionStopId!.Value));
        Assert.Equal("PENDING", detail.Execution.Command!.State);
        await using var db = w.H.Context();
        Assert.Single(await db.TourEvents.AsNoTracking().Where(e => e.EventType == TourLifecycleEvents.Departed).ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task PauseOfADeliveredLeg_SendsACancel_PausesWhenTheRobotStops_AndResumeIsANewLegToTheSameStop()
    {
        await using var w = await World.Create(enabled: true);
        await OpenAndDepart(w);
        var goTo = await Delivered(w);
        await Pause(w);

        var pausing = await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId));
        Assert.Equal(("NORMAL", true), (pausing.Execution!.OperationalStatus, pausing.Execution.Command!.CancelRequested));
        Assert.False(pausing.AllowedActions!.Pause!.Allowed);
        await w.Report(status: "NAVIGATING");
        var polled = await w.H.Send(new PollRobotCommandCommand(TourReadySqlTests.Robot, w.Stream));
        Assert.Equal((RobotCommandKinds.Cancel, goTo.LegId), (polled.Command!.Kind, polled.Command.LegId));

        await Result(w, goTo, "TERMINAL", "CANCELLED");
        var paused = await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId));
        Assert.Equal(TourRuntime.Paused, paused.Execution!.OperationalStatus);
        await w.Report();
        Assert.True(paused.AllowedActions!.RetryLeg.Allowed || (await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId))).AllowedActions!.RetryLeg.Allowed);
        await using (var db = w.H.Context())
            Assert.Equal(0, await db.RobotCommands.CountAsync(c => c.IsOpen));

        await Resume(w);
        var resumed = await w.H.Detail();
        Assert.Equal(("NORMAL", TourRuntime.Navigating, paused.Execution.CurrentRevisionStopId),
            (resumed.Execution!.OperationalStatus, resumed.Execution.CurrentStep, resumed.Execution.CurrentRevisionStopId));
        Assert.NotEqual(goTo.LegId, resumed.Execution.CurrentLegId);
        Assert.Equal("PENDING", resumed.Execution.Command!.State);
    }

    [SchemaV11Fact]
    public async Task PauseOfAnUndeliveredLeg_WithdrawsIt_AndPausesAtOnce()
    {
        await using var w = await World.Create(enabled: true);
        await OpenAndDepart(w);
        var goTo = await Current(w);
        await Pause(w);

        await using var db = w.H.Context();
        Assert.Equal(("EXPIRED", "WITHDRAWN"), await db.RobotCommands.AsNoTracking().Where(c => c.Id == goTo.Id).Select(c => ValueTuple.Create(c.State, c.ReasonCode!)).SingleAsync());
        Assert.Equal(TourRuntime.Paused, (await w.H.Detail()).Execution!.OperationalStatus);
        // Nothing is left for the robot to pick up.
        Assert.Null((await w.H.Send(new PollRobotCommandCommand(TourReadySqlTests.Robot, w.Stream))).Command);
    }

    [SchemaV11Fact]
    public async Task AnArrivalThatBeatsThePause_OpensThePoi_AndAPauseIsRefusedWithoutALeg()
    {
        await using var w = await World.Create(enabled: true);
        await OpenAndDepart(w);
        var goTo = await Delivered(w);
        await Pause(w);
        Assert.Equal("TOUR_PAUSE_PENDING", (await Assert.ThrowsAsync<ConflictException>(() => Pause(w))).Code);
        await Result(w, goTo, "TERMINAL", "ARRIVED");

        var detail = await w.H.Detail();
        Assert.Equal(("NORMAL", TourRuntime.Observing), (detail.Execution!.OperationalStatus, detail.Execution.CurrentStep));
        await using (var db = w.H.Context())
            Assert.Equal(0, await db.RobotCommands.CountAsync(c => c.IsOpen));
        Assert.Equal("TOUR_STATE_INVALID", (await Assert.ThrowsAsync<ConflictException>(() => Pause(w))).Code);
    }

    [SchemaV11Fact]
    public async Task SkipAtAPoi_GoesToTheOneAfter_AndSkipAfterAPause_GoesPastThePausedTarget()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await OpenAndDepart(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await w.Report();
        await Skip(w);
        var detail = await w.H.Detail();
        Assert.Equal((TourRuntime.ReturningToEnd, (Guid?)null), (detail.Execution!.CurrentStep, detail.Execution.CurrentRevisionStopId));
        await using (var db = w.H.Context())
            Assert.Equal((int?)2, (await db.TourEvents.AsNoTracking().SingleAsync(e => e.EventType == TourLifecycleEvents.StopSkipped)).TargetStopOrder);

        await using var other = await World.Create(enabled: true, twoStopsToEndPose: true);
        await OpenAndDepart(other);
        await Pause(other);
        await Skip(other);
        var skipped = await other.H.Detail();
        Assert.Equal(("NORMAL", skipped.RouteRevision!.Stops[1].Id), (skipped.Execution!.OperationalStatus, skipped.Execution.CurrentRevisionStopId!.Value));
    }

    [SchemaV11Fact]
    public async Task EndingWhileTheRobotStandsStill_ReleasesItWithoutAnInspection()
    {
        await using var w = await World.Create(enabled: true);
        await Open(w);
        await w.H.Send(new EndTourEarlyCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version(), "Demo xong")));

        await using var db = w.H.Context();
        Assert.Equal("CANCELLED", (await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId)).State);
        var robot = await db.Robots.AsNoTracking().SingleAsync();
        Assert.Equal(((Guid?)null, false), (robot.CurrentTourId, robot.NeedsInspection));
    }

    [SchemaV11Fact]
    public async Task AutoAdvance_LeavesOnceWhenTheDwellEnds_AndABlockedAttemptIsNotRepeated()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        await OpenAndDepart(w);
        await w.H.Send(new SetTourAutoAdvanceCommand(w.H.TourId, w.H.OperatorId, true));
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await w.Report();
        Assert.Empty(await w.H.Send(new ListAutoAdvanceDueQuery()));

        w.Clock.Now = w.Clock.Now!.Value.AddSeconds(31);
        await w.Report(localized: false);
        Assert.Equal([w.H.TourId], await w.H.Send(new ListAutoAdvanceDueQuery()));
        Assert.True(await w.H.Send(new AutoAdvanceTourCommand(w.H.TourId)));
        var blocked = await w.H.Detail();
        Assert.Equal((TourRuntime.Observing, "robotLocalized"), (blocked.Execution!.CurrentStep, blocked.Execution.AutoAdvance!.BlockedReason));

        // Ready again, but the visit already had its attempt: the robot does not leave by itself later.
        await w.Report();
        Assert.False(await w.H.Send(new AutoAdvanceTourCommand(w.H.TourId)));
        Assert.Equal(TourRuntime.Observing, (await w.H.Detail()).Execution!.CurrentStep);

        await using var other = await World.Create(enabled: true, twoStopsToEndPose: true);
        await OpenAndDepart(other);
        await other.H.Send(new SetTourAutoAdvanceCommand(other.H.TourId, other.H.OperatorId, true));
        await Result(other, await Delivered(other), "TERMINAL", "ARRIVED");
        other.Clock.Now = other.Clock.Now!.Value.AddSeconds(31);
        await other.Report();
        Assert.True(await other.H.Send(new AutoAdvanceTourCommand(other.H.TourId)));
        var moved = await other.H.Detail();
        Assert.Equal((TourRuntime.Navigating, moved.RouteRevision!.Stops[1].Id), (moved.Execution!.CurrentStep, moved.Execution.CurrentRevisionStopId!.Value));
        Assert.False(await other.H.Send(new AutoAdvanceTourCommand(other.H.TourId)));
    }

    private static async Task Open(World w) => await w.H.Send(new StartTourCommand(w.H.TourId, w.H.OperatorId,
        new(Guid.NewGuid(), await w.H.Version(), null, HoldAtStart: true)));

    private static async Task Depart(World w, TourStartConfirmation? confirmation) =>
        await w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version(), confirmation)));

    private static async Task OpenAndDepart(World w)
    {
        await Open(w);
        await Depart(w, Confirmed);
    }

    private static async Task Pause(World w) =>
        await w.H.Send(new PauseTourLegCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version())));

    private static async Task Resume(World w) =>
        await w.H.Send(new RetryTourLegCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version())));

    private static async Task Skip(World w) =>
        await w.H.Send(new SkipTourStopCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version())));
}
