using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Commands.UpdateTour;

public sealed class UpdateTourCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteManagementRepository routes, TimeProvider clock) : IRequestHandler<UpdateTourCommand, TourMutationResult>
{
    public async Task<TourMutationResult> Handle(UpdateTourCommand command, CancellationToken ct)
    {
        var input = TourPreparation.Normalize(command.Request.Configuration);
        var fingerprint = TourRequestReceipt.Fingerprint("TOUR_UPDATED", command.Id, input, command.Request.ExpectedRouteVersion);
        var replay = await TourRequestReceipt.ReplayAsync(repository, command.Actor, command.Request.RequestId,
            "TOUR_UPDATED", command.Id, fingerprint, ct);
        if (replay.HasValue) return new(replay.Value);
        var tour = await registrations.LockTourAsync(command.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Request.ExpectedRowVersion);
        var permissions = TourPreparation.Permissions(tour, await repository.GetUsageAsync(tour.Id, ct));
        if (!permissions.CanEditMetadata) throw new ConflictException("Tour chỉ được sửa khi SCHEDULED và chưa vận hành.", "TOUR_LOCKED");
        var routeChanged = tour.RouteId != input.RouteId;
        var scheduleChanged = tour.ScheduledStartAt != input.ScheduledStartAt;
        if ((routeChanged || scheduleChanged) && !permissions.CanChangeScheduleAndRoute)
            throw new ConflictException("Tour đã có đăng ký, nhánh hoặc lịch sử; cần workflow thay đổi lịch/tuyến riêng.", "TOUR_CONFIGURATION_LOCKED");
        if (routeChanged || scheduleChanged) TourPreparation.RequireConfiguredDuration();
        var now = clock.GetUtcNow();
        if (scheduleChanged) TourPreparation.RequireFuture(input.ScheduledStartAt, now);
        var changed = new List<string>();
        if (routeChanged)
        {
            if (!LegacyRouteRevision.IsValid(command.Request.ExpectedRouteVersion))
                throw new ConflictException("Cần phiên bản Route đích trước khi đổi tuyến.", "ROUTE_VERSION_REQUIRED");
            await TourPreparation.SelectRouteAsync(routes, input.RouteId, command.Request.ExpectedRouteVersion!, ct);
            now = clock.GetUtcNow();
            if (scheduleChanged) TourPreparation.RequireFuture(input.ScheduledStartAt, now);
            repository.AddRouteChangeEvent(tour, tour.RouteId, command.Actor, now);
            tour.RouteId = input.RouteId;
            tour.ActiveRouteId = input.RouteId;
            changed.Add("routeId");
        }
        if (tour.Name != input.Name) { tour.Name = input.Name; changed.Add("name"); }
        if (tour.Description != input.Description) { tour.Description = input.Description; changed.Add("description"); }
        if (scheduleChanged) { tour.ScheduledStartAt = input.ScheduledStartAt; changed.Add("scheduledStartAt"); }
        if (tour.FallbackVideoUrl != input.FallbackVideoUrl) { tour.FallbackVideoUrl = input.FallbackVideoUrl; changed.Add("fallbackVideoUrl"); }
        if (changed.Count == 0) return new(tour.Id);
        tour.UpdatedAt = now;
        TourRequestReceipt.Append(repository, tour, command.Actor, command.Request.RequestId, "TOUR_UPDATED", fingerprint, now, changed.ToArray());
        return new(tour.Id);
    }
}
