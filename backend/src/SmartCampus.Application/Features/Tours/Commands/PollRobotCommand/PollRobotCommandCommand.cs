using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours.Commands.SweepRobotCommand;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.PollRobotCommand;

/// <summary>The robot asks for its current command; <paramref name="RobotCode"/> comes from robot authentication.</summary>
public sealed record PollRobotCommandCommand(string RobotCode, Guid StreamId) : ITourMutationCommand<RobotCommandPollResult>;
public sealed record RobotCommandPollResult(RobotCommand? Command);

public sealed class PollRobotCommandCommandValidator : AbstractValidator<PollRobotCommandCommand>
{
    public PollRobotCommandCommandValidator()
    {
        RuleFor(c => c.RobotCode).NotEmpty();
        RuleFor(c => c.StreamId).NotEmpty();
    }
}

/// <summary>
/// Delivers the robot's one current command (ADR-0042 §1, §3). Bound to telemetry: only the stream the backend currently
/// hears gets anything. A new stream never receives what an earlier stream received; that command becomes UNKNOWN.
/// A Cancel goes first and is always delivered; a GoTo needs <c>FleetCommands:Enabled</c>, and a new GoTo also a healthy
/// Tour, a dispatchable robot and a robot still reporting ready. The flag only stops movement: with it off the stream check, the timeouts and Cancel
/// delivery still run, so turning it off never strands a Cancel.
/// </summary>
public sealed class PollRobotCommandCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, IFleetTelemetryStore telemetry, FleetCommandSettings settings, TimeProvider clock)
    : IRequestHandler<PollRobotCommandCommand, RobotCommandPollResult>
{
    public async Task<RobotCommandPollResult> Handle(PollRobotCommandCommand poll, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var snapshot = RobotTelemetry.Latest(telemetry, poll.RobotCode);
        if (snapshot is null || snapshot.Report.StreamId != poll.StreamId || now - snapshot.ReceivedAt > settings.MaxTelemetryAge)
            throw new ConflictException("Stream này không phải stream telemetry hiện tại của robot.", "STREAM_NOT_CURRENT");

        var robot = await revisions.FindPhysicalRobotAsync(poll.RobotCode, ct);
        if (robot is null || await repository.FindOpenCommandTourAsync(robot.Id, ct) is not { } tourId) return new(null);
        var tour = await registrations.LockTourAsync(tourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour của lệnh.");
        if (await repository.LockOpenGoToAsync(tourId, ct) is not { } goTo) return new(null);
        var cancel = await repository.LockOpenCancelAsync(goTo.Id, ct);

        foreach (var command in new[] { goTo, cancel })
            if (command is not null && RobotCommandTimeouts.Decide(command, poll.StreamId, now, settings) is { } timeout)
                RobotCommandTimeouts.Apply(repository, tour, command, timeout, telemetryFresh: true, now);

        if (cancel is { IsOpen: true })
            return new(Deliver(tour, cancel, poll.StreamId, now));
        if (!goTo.IsOpen || goTo.State == RobotCommandStates.Unknown || !settings.Enabled) return new(null);
        if (goTo.State == RobotCommandStates.Pending && !(CanSendMovement(tour, robot) && RobotStillReady(snapshot.Report, goTo))) return new(null);
        return new(Deliver(tour, goTo, poll.StreamId, now));
    }

    private static bool CanSendMovement(Tour tour, Robot robot) => tour.State == TourRuntime.Running &&
        tour.OperationalStatus == TourRuntime.Normal && robot.IsDispatchEnabled && !robot.NeedsInspection;

    /// <summary>
    /// Start and Next checked the robot up to one accept window ago; it may have lost its position or been stopped since.
    /// Judged from the report that already passed the stream check. A GoTo left undelivered is the sweeper's to expire.
    /// </summary>
    private static bool RobotStillReady(FleetTelemetryReport report, RobotCommand goTo) =>
        report.Localized == true && report.MotionReady == true && report.Status == "IDLE" &&
        report.MapKey == goTo.MapKey && report.FrameId == goTo.FrameId;

    private RobotCommand Deliver(Tour tour, RobotCommand command, Guid streamId, DateTimeOffset now)
    {
        if (command.State != RobotCommandStates.Pending) return command;
        command.Deliver(streamId, now);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.CommandDelivered, OccurredAt = now, RobotId = command.RobotId,
            RouteId = tour.ActiveRouteId, LegId = command.LegId, LegKind = command.LegKind, CommandId = command.Id
        });
        return command;
    }
}
