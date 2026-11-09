using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.CreateQuickTour;

/// <summary>
/// ADR-0053: a quick Tour has no date or shift. It holds its robot from now until a run begun at its latest Start would
/// end, its published time is that latest Start, and it is marked short notice (ADR-0050) for the registration rules.
/// The target, robot, Admin block and hold checks are the ones of a Tour on a shift, under the same locks in the same order.
/// </summary>
public sealed class CreateQuickTourCommandHandler(ITourManagementRepository repository, IRouteRevisionRepository revisions,
    IMapVersionRepository maps, IScheduleBlockRepository blocks, TourScheduleSettings settings, TimeProvider clock)
    : IRequestHandler<CreateQuickTourCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(CreateQuickTourCommand command, CancellationToken ct)
    {
        var input = TourPreparation.Normalize(command.Request.Configuration);
        var fingerprint = TourRequestReceipt.Fingerprint("TOUR_CREATED", null, input);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId, "TOUR_CREATED", null, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        var wait = settings.ShortNoticeMinLead;
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

        // The hold is known only from the clock; lock every campus date it could touch, a day past the latest bound, in order.
        var provisional = clock.GetUtcNow();
        var latestEnd = TourSchedule.QuickTourDeadline(provisional, wait) + TimeSpan.FromSeconds(settings.LongestShiftMaxSeconds)
            + TourSchedule.ReservationBuffer + TimeSpan.FromMinutes(5);
        var dates = TourSchedule.DatesOf(provisional, latestEnd);
        foreach (var date in dates) await blocks.LockDateAsync(date, ct);
        var activeBlocks = await blocks.ListActiveAsync(dates[0], dates[^1], ct);

        // Decided after the locks, on a fresh clock, so a hold taken or a day closed while waiting is seen.
        var now = clock.GetUtcNow();
        var deadline = TourSchedule.QuickTourDeadline(now, wait);
        var (startsAt, endsAt) = plan is null ? (now, deadline) : TourSchedule.QuickTourHold(now, deadline, plan.ExpectedDurationSeconds);
        TourSchedule.EnsureUsable(TourSchedule.EvaluateQuickTour(settings, now, deadline, plan,
            await repository.GetActiveReservationsAsync(robot.Id, startsAt, endsAt, ct), activeBlocks));

        var tour = new Tour
        {
            Id = Guid.NewGuid(), Name = input.Name, Description = input.Description, RouteId = revision.RouteId,
            ActiveRouteId = revision.RouteId, RouteRevisionId = revision.Id, OperatorUserId = input.OperatorUserId,
            ScheduledStartAt = deadline, State = "SCHEDULED",
            FallbackVideoUrl = input.FallbackVideoUrl, CreatedByUserId = command.Actor, CreatedAt = now, Capacity = input.Capacity,
            IsShortNotice = true
        };
        repository.Add(tour);
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = TourLifecycleEvents.CreatedShortNotice, OccurredAt = now, ActorUserId = command.Actor,
            ReasonNote = input.Reason
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
