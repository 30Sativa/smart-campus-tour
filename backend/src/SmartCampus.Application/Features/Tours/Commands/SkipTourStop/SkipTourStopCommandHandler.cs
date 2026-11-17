using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours.Commands.RetryTourLeg;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.SkipTourStop;

/// <summary>
/// Skips the POI the robot would go to next and goes to the one after it, or to the end pose, or completes the Tour when
/// the skipped POI was the last of a route that ends there. Allowed while the robot is stopped: at the start, at a POI,
/// or after a paused or failed leg that Retry could resume. The skipped POI is recorded (STOP_SKIPPED); nothing else of
/// the route changes. Movement checks apply when a new leg is created.
/// </summary>
public sealed class SkipTourStopCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, TourStartPreflight preflight, FleetCommandSettings settings,
    TimeProvider clock) : IRequestHandler<SkipTourStopCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(SkipTourStopCommand command, CancellationToken ct)
    {
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.Skip, command.Id, command.Request.Confirmation);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Skip, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);

        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới bỏ qua điểm dừng được.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        var previous = tour.CurrentLegId is { } legId ? await repository.FindLegCommandAsync(legId, ct) : null;
        if (!CanSkip(tour, previous))
            throw new ConflictException("Chỉ bỏ qua điểm dừng khi robot đang đứng yên: ở điểm xuất phát, tại POI hoặc sau khi chặng đã dừng.",
                "TOUR_STATE_INVALID");
        var robotId = tour.AssignedRobotId!.Value;
        if (await repository.HasOpenCommandAsync(robotId, ct))
            throw new ConflictException("Robot còn lệnh đang mở.", "TOUR_COMMAND_OPEN");

        var revision = await revisions.FindRevisionAsync(tour.RouteRevisionId!.Value, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản tuyến.");
        var stops = await revisions.GetStopsAsync(revision.Id, ct);
        var skipped = SkippedStop(tour, revision, stops)
            ?? throw new ConflictException("Không còn điểm dừng nào phía trước để bỏ qua.", "NOTHING_TO_SKIP");
        var target = TourLegDispatch.After(skipped.StopOrder, revision, stops);
        var departing = tour.CurrentStep == TourRuntime.Initializing;

        var map = await revisions.GetMapAsync(revision.MapVersionId, ct) ?? throw new NotFoundException("Không tìm thấy phiên bản bản đồ.");
        Robot? robot = null;
        if (target is not null)
        {
            robot = await TourTarget.FindReservedRobotAsync(revisions, robotId, ct)
                ?? throw new NotFoundException("Không tìm thấy robot của Tour.");
            var checks = await preflight.EvaluateMovementAsync(tour, robot, map, ct, command.Request.Confirmation,
                includeConfirmation: departing);
            if (checks.BlockedBy.Count > 0)
                throw new ConflictException("Chưa đủ điều kiện để robot di chuyển.", TourStartPreflight.MovementFailedCode,
                    checks: checks.Checks, blockedBy: checks.BlockedBy);
        }

        var now = clock.GetUtcNow();
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.StopSkipped, OccurredAt = now, RobotId = robotId,
            RouteId = tour.ActiveRouteId, TargetStopOrder = skipped.StopOrder, ActorUserId = command.Actor
        });
        if (departing)
            repository.AddEvent(new TourEvent
            {
                TourId = tour.Id, EventType = TourLifecycleEvents.Departed, OccurredAt = now, RobotId = robotId,
                RouteId = tour.ActiveRouteId, ActorUserId = command.Actor
            });
        await TourAdvance.GoAsync(repository, settings, tour, map, target, command.Actor, now, ct);
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Skip, fingerprint, now, "state");
        return new(tour.Id);
    }

    /// <summary>The robot is stopped and the Operator could otherwise go on: Next, or Retry/Resume of the stopped leg.</summary>
    internal static bool CanSkip(Tour tour, RobotCommand? previous) =>
        tour.CanAdvance || RetryTourLegCommandHandler.CanRetry(tour, previous);

    /// <summary>
    /// The POI the robot would go to next: from the start or a POI, the next one; after a stopped leg, that leg's target.
    /// Null when that is the end pose, or nothing is left.
    /// </summary>
    internal static RouteRevisionStop? SkippedStop(Tour tour, RouteRevision revision, IReadOnlyList<RouteRevisionStop> stops) =>
        tour.CanAdvance
            ? TourLegDispatch.NextTarget(tour, revision, stops)?.Stop
            : tour.CurrentRevisionStopId is { } stopId ? stops.Single(stop => stop.Id == stopId) : null;
}
