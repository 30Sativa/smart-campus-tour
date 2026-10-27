using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.CreateTour;

public sealed class CreateTourCommandHandler(ITourManagementRepository repository, IRouteManagementRepository routes, TimeProvider clock)
    : IRequestHandler<CreateTourCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(CreateTourCommand command, CancellationToken ct)
    {
        var input = TourPreparation.Normalize(command.Request.Configuration);
        var fingerprint = TourRequestReceipt.Fingerprint("TOUR_CREATED", null, input, command.Request.ExpectedRouteVersion);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId, "TOUR_CREATED", null, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        TourPreparation.RequireFuture(input.ScheduledStartAt, clock.GetUtcNow());
        await TourPreparation.SelectRouteAsync(routes, input.RouteId, command.Request.ExpectedRouteVersion, ct);
        var now = clock.GetUtcNow();
        TourPreparation.RequireFuture(input.ScheduledStartAt, now);
        TourPreparation.RequireConfiguredDuration();
        var tour = new Tour
        {
            Id = Guid.NewGuid(), Name = input.Name, Description = input.Description, RouteId = input.RouteId,
            ActiveRouteId = input.RouteId, ScheduledStartAt = input.ScheduledStartAt, State = "SCHEDULED",
            FallbackVideoUrl = input.FallbackVideoUrl, CreatedByUserId = command.Actor, CreatedAt = now
        };
        repository.Add(tour);
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId,
            "TOUR_CREATED", fingerprint, now, "name", "description", "routeId", "scheduledStartAt", "fallbackVideoUrl", "state");
        return new(tour.Id);
    }
}
