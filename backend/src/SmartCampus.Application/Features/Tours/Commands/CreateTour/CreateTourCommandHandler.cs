using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.CreateTour;

public sealed class CreateTourCommandHandler(ITourManagementRepository repository, IRouteRevisionRepository revisions,
    IMapVersionRepository maps, IScheduleBlockRepository blocks, TourScheduleSettings settings, TimeProvider clock) : IRequestHandler<CreateTourCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(CreateTourCommand command, CancellationToken ct)
    {
        var input = TourPreparation.Normalize(command.Request.Configuration);
        var fingerprint = TourRequestReceipt.Fingerprint("TOUR_CREATED", null, input);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId, "TOUR_CREATED", null, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        TourPreparation.RequireFuture(input.ScheduledStartAt, clock.GetUtcNow());
        var shift = TourSchedule.RequireShift(settings, input.ScheduledStartAt);
        // A short-notice Tour differs only in its lead time and registration deadlines; the rest of this path is shared (ADR-0050).
        TimeSpan? shortNoticeLead = input.ShortNoticeReason is null ? null : TourSchedule.RequireShortNoticeLead(settings);
        var (revision, run) = await TourTarget.RequireTestedRevisionAsync(revisions, maps, input.RouteRevisionId, lockTarget: true, ct);
        await TourTarget.RequireOperatorAsync(revisions, input.OperatorUserId, ct);
        var found = await revisions.FindPhysicalRobotAsync(input.RobotCode, ct)
            ?? throw new NotFoundException("Không tìm thấy robot vật lý.");
        // Deactivation takes these two locks in this order, so the robot is read again behind them.
        await revisions.LockRobotDeploymentStateAsync(found.Id, ct);
        await repository.LockRobotReservationsAsync(found.Id, ct);
        var robot = await revisions.FindPhysicalRobotAsync(input.RobotCode, ct)
            ?? throw new NotFoundException("Không tìm thấy robot vật lý.");
        await TourTarget.RequireUsableRobotAsync(revisions, robot, revision, ct);
        var plan = await TourTarget.PlanReservationAsync(revisions, revision.Id, run, ct);
        // The robot is held for the whole shift (docs/lich-tour-theo-ca.md §3).
        var (startsAt, endsAt) = TourSchedule.ShiftWindow(shift.Date, shift.Shift);
        // Admin takes this same lock to close a day or shift, so a block and a new Tour cannot pass each other.
        await blocks.LockDateAsync(shift.Date, ct);
        var adminBlock = TourSchedule.BlockOf(await blocks.ListActiveAsync(shift.Date, shift.Date, ct), shift);
        // Decided after the locks, on a fresh clock, so a shift taken or closed while waiting is seen.
        var now = clock.GetUtcNow();
        TourSchedule.EnsureUsable(TourSchedule.Evaluate(shift, now, plan,
            await repository.GetActiveReservationsAsync(robot.Id, startsAt, endsAt, ct), adminBlock, shortNoticeLead));
        var tour = new Tour
        {
            Id = Guid.NewGuid(), Name = input.Name, Description = input.Description, RouteId = revision.RouteId,
            ActiveRouteId = revision.RouteId, RouteRevisionId = revision.Id, OperatorUserId = input.OperatorUserId,
            ScheduledStartAt = input.ScheduledStartAt, State = "SCHEDULED",
            FallbackVideoUrl = input.FallbackVideoUrl, CreatedByUserId = command.Actor, CreatedAt = now, Capacity = input.Capacity,
            IsShortNotice = shortNoticeLead is not null
        };
        repository.Add(tour);
        if (tour.IsShortNotice)
            repository.AddEvent(new TourEvent
            {
                TourId = tour.Id, EventType = TourLifecycleEvents.CreatedShortNotice, OccurredAt = now, ActorUserId = command.Actor,
                ReasonNote = input.ShortNoticeReason
            });
        repository.Add(new TourRobotReservation
        {
            Id = Guid.NewGuid(), TourId = tour.Id, RobotId = robot.Id, RouteTestRunId = run.Id,
            MeasuredDurationSeconds = plan!.MeasuredDurationSeconds, ExpectedDurationSeconds = plan.ExpectedDurationSeconds,
            StartsAt = startsAt, EndsAt = endsAt,
            ReservedByUserId = command.Actor, ReservedAt = now
        });
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId, "TOUR_CREATED", fingerprint, now,
            "name", "description", "routeRevisionId", "operatorUserId", "robotReservation", "scheduledStartAt", "fallbackVideoUrl", "state", "capacity", "isShortNotice");
        return new(tour.Id);
    }
}
