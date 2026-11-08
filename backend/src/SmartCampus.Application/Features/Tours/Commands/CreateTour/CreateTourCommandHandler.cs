using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.CreateTour;

public sealed class CreateTourCommandHandler(ITourManagementRepository repository, IRouteRevisionRepository revisions,
    IMapVersionRepository maps, TourScheduleSettings settings, TimeProvider clock) : IRequestHandler<CreateTourCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(CreateTourCommand command, CancellationToken ct)
    {
        var input = TourPreparation.Normalize(command.Request.Configuration);
        var fingerprint = TourRequestReceipt.Fingerprint("TOUR_CREATED", null, input);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId, "TOUR_CREATED", null, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        TourPreparation.RequireFuture(input.ScheduledStartAt, clock.GetUtcNow());
        if (TourSchedule.StartRule(settings, input.ScheduledStartAt) is { } outside)
            throw new ConflictException(outside.Message, "TOUR_SLOT_NOT_ALLOWED");
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
        var (startsAt, endsAt) = TourSchedule.Window(input.ScheduledStartAt, plan?.ExpectedDurationSeconds ?? run.MeasuredDurationSeconds);
        // Decided after the robot lock, on a fresh clock, so a slot taken while waiting is seen.
        var now = clock.GetUtcNow();
        TourSchedule.EnsureUsable(TourSchedule.Evaluate(input.ScheduledStartAt, now, settings.LeadTime, plan,
            await repository.GetActiveReservationsAsync(robot.Id, startsAt, endsAt, ct)));
        var tour = new Tour
        {
            Id = Guid.NewGuid(), Name = input.Name, Description = input.Description, RouteId = revision.RouteId,
            ActiveRouteId = revision.RouteId, RouteRevisionId = revision.Id, OperatorUserId = input.OperatorUserId,
            ScheduledStartAt = input.ScheduledStartAt, State = "SCHEDULED",
            FallbackVideoUrl = input.FallbackVideoUrl, CreatedByUserId = command.Actor, CreatedAt = now
        };
        repository.Add(tour);
        repository.Add(new TourRobotReservation
        {
            Id = Guid.NewGuid(), TourId = tour.Id, RobotId = robot.Id, RouteTestRunId = run.Id,
            MeasuredDurationSeconds = plan!.MeasuredDurationSeconds, ExpectedDurationSeconds = plan.ExpectedDurationSeconds,
            StartsAt = startsAt, EndsAt = endsAt,
            ReservedByUserId = command.Actor, ReservedAt = now
        });
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId, "TOUR_CREATED", fingerprint, now,
            "name", "description", "routeRevisionId", "operatorUserId", "robotReservation", "scheduledStartAt", "fallbackVideoUrl", "state");
        return new(tour.Id);
    }
}
