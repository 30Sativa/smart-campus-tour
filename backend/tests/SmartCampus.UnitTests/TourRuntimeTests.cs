using FluentValidation.TestHelper;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.ReportCommandResult;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class TourRuntimeTests
{
    private static RobotCommand GoTo() => RobotCommand.GoTo(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), RobotLegKinds.ToEnd, null,
        "pilot-v1", "map", 1m, 2m, 0m, DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch.AddSeconds(30), null);

    [Fact]
    public void NewGoTo_IsPendingAndOpen_WithNoOutcome()
    {
        var command = GoTo();
        Assert.Equal((RobotCommandKinds.GoTo, RobotCommandStates.Pending, true, (string?)null), (command.Kind, command.State, command.IsOpen, command.Outcome));
    }

    [Theory]
    [InlineData(RobotCommandStates.Arrived)]
    [InlineData(RobotCommandStates.Failed)]
    [InlineData(RobotCommandStates.Cancelled)]
    public void Finish_SetsStateAndOutcomeTogether_AndClosesTheCommand(string outcome)
    {
        var command = GoTo();
        command.Finish(outcome, DateTimeOffset.UnixEpoch.AddSeconds(5), "REASON");
        Assert.Equal((outcome, outcome, false, "REASON"), (command.State, command.Outcome, command.IsOpen, command.ReasonCode));
        Assert.NotNull(command.CompletedAt);
    }

    [Fact]
    public void Accept_StaysOpen_AndReject_ClosesWithoutAnOutcome()
    {
        var command = GoTo();
        command.Accept(DateTimeOffset.UnixEpoch.AddSeconds(1));
        Assert.Equal((RobotCommandStates.Accepted, true, (string?)null), (command.State, command.IsOpen, command.Outcome));

        var rejected = GoTo();
        rejected.Reject(DateTimeOffset.UnixEpoch.AddSeconds(1), "BUSY");
        Assert.Equal((RobotCommandStates.Rejected, false, (string?)null, "BUSY"), (rejected.State, rejected.IsOpen, rejected.Outcome, rejected.ReasonCode));
    }

    [Fact]
    public void TourLegs_SetTheStepFromTheLegKind_AndOnlyObservingCanAdvance()
    {
        var tour = new Tour { State = "READY" };
        var now = DateTimeOffset.UnixEpoch;
        tour.Start(Guid.NewGuid(), now);
        var stop = Guid.NewGuid();
        tour.BeginLeg(Guid.NewGuid(), RobotLegKinds.ToPoi, stop, now);
        Assert.Equal(TourRuntime.Navigating, tour.CurrentStep);
        Assert.False(tour.CanAdvance);
        tour.ArriveAtStop(stop, now.AddSeconds(30), now);
        Assert.True(tour.CanAdvance);
        tour.RequireAssistance(TourRuntime.CommandRejected, now);
        Assert.False(tour.CanAdvance);

        var returning = new Tour();
        returning.BeginLeg(Guid.NewGuid(), RobotLegKinds.ToEnd, null, now);
        Assert.Equal(TourRuntime.ReturningToEnd, returning.CurrentStep);
    }

    [Fact]
    public void CancelOf_CarriesTheLegWithoutATarget_AndClosesAsExpiredOrUnknown()
    {
        var goTo = GoTo();
        var cancel = RobotCommand.CancelOf(goTo, DateTimeOffset.UnixEpoch.AddSeconds(1), null);
        Assert.Equal((RobotCommandKinds.Cancel, goTo.LegId, (Guid?)goTo.Id, (decimal?)null, true), (cancel.Kind, cancel.LegId, cancel.TargetCommandId, cancel.X, cancel.IsOpen));

        cancel.CloseCancel(DateTimeOffset.UnixEpoch.AddSeconds(2));
        Assert.Equal((RobotCommandStates.Expired, false, RobotCommand.LegEndedReason), (cancel.State, cancel.IsOpen, cancel.ReasonCode));

        var accepted = RobotCommand.CancelOf(goTo, DateTimeOffset.UnixEpoch, null);
        accepted.Accept(DateTimeOffset.UnixEpoch.AddSeconds(1));
        accepted.CloseCancel(DateTimeOffset.UnixEpoch.AddSeconds(2));
        Assert.Equal((RobotCommandStates.Unknown, false), (accepted.State, accepted.IsOpen));
    }

    [Fact]
    public void UnknownGoTo_StaysOpen_UntilReconciled_WithoutAnOutcome()
    {
        var command = GoTo();
        command.MarkUnknown(DateTimeOffset.UnixEpoch.AddSeconds(1), "ACK_TIMEOUT");
        Assert.True(command.IsOpen);
        command.Reconcile(Guid.NewGuid(), "Đã xem", DateTimeOffset.UnixEpoch.AddSeconds(2));
        Assert.Equal((RobotCommandStates.Reconciled, false, (string?)null), (command.State, command.IsOpen, command.Outcome));
    }

    [Fact]
    public void TimeoutRules_ProveNothingWithoutEvidence_AndLeaveAnAcceptedCancelToItsGoTo()
    {
        var settings = new FleetCommandSettings(enabled: true);
        var stream = Guid.NewGuid();
        var pending = GoTo();
        Assert.Null(RobotCommandTimeouts.Decide(pending, null, pending.AcceptBy!.Value, settings));
        Assert.Equal(RobotCommandStates.Expired, RobotCommandTimeouts.Decide(pending, null, pending.AcceptBy.Value.AddMilliseconds(1), settings)!.State);

        var delivered = GoTo();
        delivered.DeliveredStreamId = stream;
        delivered.State = RobotCommandStates.Delivered;
        Assert.Null(RobotCommandTimeouts.Decide(delivered, null, delivered.AcceptBy!.Value, settings));
        Assert.Null(RobotCommandTimeouts.Decide(delivered, stream, delivered.AcceptBy.Value, settings));
        Assert.Equal(RobotCommandTimeouts.StreamChanged, RobotCommandTimeouts.Decide(delivered, Guid.NewGuid(), DateTimeOffset.UnixEpoch, settings)!.Reason);

        var cancel = RobotCommand.CancelOf(delivered, DateTimeOffset.UnixEpoch, null);
        Assert.Null(RobotCommandTimeouts.Decide(cancel, stream, DateTimeOffset.UnixEpoch.AddDays(1), settings));
        cancel.DeliveredStreamId = stream;
        cancel.Accept(DateTimeOffset.UnixEpoch);
        Assert.Null(RobotCommandTimeouts.Decide(cancel, Guid.NewGuid(), DateTimeOffset.UnixEpoch.AddDays(1), settings));
    }

    [Fact]
    public void FleetCommands_AreOffByDefault_AndCanBeEnabled()
    {
        Assert.False(new FleetCommandSettings().Enabled);
        Assert.True(new FleetCommandSettings(enabled: true).Enabled);
        Assert.Throws<InvalidOperationException>(() => new FleetCommandSettings(acceptWindowSeconds: 0));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(10)]
    [InlineData(15)]  // The reservation buffer: an early run still starts inside the Tour's own robot hold.
    public void StartEarlyLimit_AcceptsUpToTheReservationBuffer(int minutes) =>
        Assert.Equal(TimeSpan.FromMinutes(minutes), new FleetCommandSettings(startEarlyLimitMinutes: minutes).StartEarlyLimit);

    [Theory]
    [InlineData(-1)]
    [InlineData(16)]
    public void StartEarlyLimit_RefusesNegativeOrBeyondTheReservationBuffer(int minutes) =>
        Assert.Throws<InvalidOperationException>(() => new FleetCommandSettings(startEarlyLimitMinutes: minutes));

    [Fact]
    public void StartEarlyLimit_DefaultsToTenMinutes() =>
        Assert.Equal(TimeSpan.FromMinutes(10), new FleetCommandSettings().StartEarlyLimit);

    [Theory]
    [InlineData("ACCEPTED", null, null, true)]
    [InlineData("REJECTED", null, "MAP_MISMATCH", true)]
    [InlineData("TERMINAL", "ARRIVED", null, true)]
    [InlineData("TERMINAL", null, null, false)]
    [InlineData("TERMINAL", "UNKNOWN", null, false)]
    [InlineData("ACCEPTED", "ARRIVED", null, false)]
    [InlineData("DONE", null, null, false)]
    [InlineData("REJECTED", null, "not upper", false)]
    public void ResultValidator_FollowsTheContract(string phase, string? outcome, string? reason, bool valid)
    {
        var result = new ReportCommandResultCommandValidator().TestValidate(new ReportCommandResultCommand("amr_01", Guid.NewGuid(), Guid.NewGuid(),
            Guid.NewGuid(), phase, outcome, reason, DateTimeOffset.UnixEpoch));
        Assert.Equal(valid, result.IsValid);
    }
}
