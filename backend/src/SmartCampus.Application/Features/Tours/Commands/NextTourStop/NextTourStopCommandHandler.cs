using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.NextTourStop;

/// <summary>
/// The Operator leaves the current POI (ADR-0043 D12): closes the visit once, then sends the next leg, or completes the Tour
/// when the route ends at its last POI. Movement checks apply only when a new command is created.
/// </summary>
public sealed class NextTourStopCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, TourStartPreflight preflight, FleetCommandSettings settings, TimeProvider clock)
    : IRequestHandler<NextTourStopCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(NextTourStopCommand command, CancellationToken ct)
    {
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.Next, command.Id);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Next, command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);

        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới đi tiếp được.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        if (!tour.CanAdvance)
            throw new ConflictException("Chỉ đi tiếp khi Tour đang chạy bình thường và đang quan sát tại POI.", "TOUR_STATE_INVALID");
        var robotId = tour.AssignedRobotId!.Value;
        if (await repository.HasOpenCommandAsync(robotId, ct))
            throw new ConflictException("Robot còn lệnh đang mở.", "TOUR_COMMAND_OPEN");

        var revision = await revisions.FindRevisionAsync(tour.RouteRevisionId!.Value, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản tuyến.");
        var target = TourLegDispatch.NextTarget(tour, revision, await revisions.GetStopsAsync(revision.Id, ct));

        var map = await revisions.GetMapAsync(revision.MapVersionId, ct) ?? throw new NotFoundException("Không tìm thấy phiên bản bản đồ.");
        if (target is not null)
        {
            var robot = await TourTarget.FindReservedRobotAsync(revisions, robotId, ct)
                ?? throw new NotFoundException("Không tìm thấy robot của Tour.");
            var checks = await preflight.EvaluateMovementAsync(tour, robot, map, ct);
            if (checks.BlockedBy.Count > 0)
                throw new ConflictException("Chưa đủ điều kiện để robot di chuyển.", TourStartPreflight.MovementFailedCode,
                    checks: checks.Checks, blockedBy: checks.BlockedBy);
        }

        var now = clock.GetUtcNow();
        tour.CloseVisit(now);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.VisitClosed, OccurredAt = now, RobotId = robotId,
            RouteId = tour.ActiveRouteId, StopVisitId = tour.CurrentStopVisitId, ActorUserId = command.Actor
        });
        if (target is null)
            await TourLegDispatch.CompleteAsync(repository, tour, robotId, command.Actor, now, ct);
        else
            TourLegDispatch.Begin(repository, settings, tour, robotId, map, target, command.Actor, now);
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            TourLifecycleEvents.Next, fingerprint, now, "state");
        return new(tour.Id);
    }
}
