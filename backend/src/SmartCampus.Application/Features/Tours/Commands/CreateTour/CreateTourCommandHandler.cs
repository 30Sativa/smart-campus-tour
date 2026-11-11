using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.CreateTour;

/// <summary>
/// A Tour on a free shift, or, with a <c>ShortNoticeReason</c> and no start, a quick Tour (ADR-0053): no shift, the robot
/// held from now until a run begun at its latest Start would end, published at that latest Start. Both take the target,
/// robot, Admin block and hold checks under the same locks in the same order.
/// </summary>
public sealed class CreateTourCommandHandler(ITourManagementRepository repository, IRouteRevisionRepository revisions,
    IMapVersionRepository maps, IScheduleBlockRepository blocks, TourScheduleSettings settings, TimeProvider clock) : IRequestHandler<CreateTourCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(CreateTourCommand command, CancellationToken ct)
    {
        var input = TourPreparation.Normalize(command.Request.Configuration);
        var fingerprint = TourRequestReceipt.Fingerprint("TOUR_CREATED", null, input);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId, "TOUR_CREATED", null, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        var quick = input.ShortNoticeReason is not null;
        TourShiftOnDay? shift = null;
        if (!quick)
        {
            TourPreparation.RequireFuture(input.ScheduledStartAt!.Value, clock.GetUtcNow());
            shift = TourSchedule.RequireShift(settings, input.ScheduledStartAt.Value);
        }
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

        // Admin takes these same date locks to close a day or shift, so a block and a new Tour cannot pass each other.
        DateTimeOffset now, scheduledStartAt, startsAt, endsAt;
        if (shift is not null)
        {
            // The robot is held for the whole shift (docs/lich-tour-theo-ca.md §3).
            (startsAt, endsAt) = TourSchedule.ShiftWindow(shift.Date, shift.Shift);
            await blocks.LockDateAsync(shift.Date, ct);
            var adminBlock = TourSchedule.BlockOf(await blocks.ListActiveAsync(shift.Date, shift.Date, ct), shift);
            // Decided after the locks, on a fresh clock, so a shift taken or closed while waiting is seen.
            now = clock.GetUtcNow();
            scheduledStartAt = input.ScheduledStartAt!.Value;
            TourSchedule.EnsureUsable(TourSchedule.Evaluate(shift, now, plan,
                await repository.GetActiveReservationsAsync(robot.Id, startsAt, endsAt, ct), adminBlock));
        }
        else
        {
            // The hold is known only from the clock: lock every campus date it could touch, past its latest bound, in order.
            var wait = settings.ShortNoticeMinLead;
            var provisional = clock.GetUtcNow();
            var latestEnd = TourSchedule.QuickTourDeadline(provisional, wait) + TimeSpan.FromSeconds(settings.LongestShiftMaxSeconds)
                + TourSchedule.ReservationBuffer + TimeSpan.FromMinutes(5);
            var dates = TourSchedule.DatesOf(provisional, latestEnd);
            foreach (var date in dates) await blocks.LockDateAsync(date, ct);
            var activeBlocks = await blocks.ListActiveAsync(dates[0], dates[^1], ct);
            now = clock.GetUtcNow();
            scheduledStartAt = TourSchedule.QuickTourDeadline(now, wait);
            (startsAt, endsAt) = plan is null ? (now, scheduledStartAt) : TourSchedule.QuickTourHold(now, scheduledStartAt, plan.ExpectedDurationSeconds);
            TourSchedule.EnsureUsable(TourSchedule.EvaluateQuickTour(settings, now, scheduledStartAt, plan,
                await repository.GetActiveReservationsAsync(robot.Id, startsAt, endsAt, ct), activeBlocks));
        }

        var tour = new Tour
        {
            Id = Guid.NewGuid(), Name = input.Name, Description = input.Description, RouteId = revision.RouteId,
            ActiveRouteId = revision.RouteId, RouteRevisionId = revision.Id, OperatorUserId = input.OperatorUserId,
            ScheduledStartAt = scheduledStartAt, State = "SCHEDULED",
            FallbackVideoUrl = input.FallbackVideoUrl, CreatedByUserId = command.Actor, CreatedAt = now, Capacity = input.Capacity,
            IsShortNotice = quick
        };
        repository.Add(tour);
        if (quick)
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
