using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Queries.GetTour;

public sealed class GetTourQueryHandler(ITourManagementRepository repository, IRouteManagementRepository routes,
    IRouteRevisionRepository revisions) : IRequestHandler<GetTourQuery, TourDetails>
{
    public async Task<TourDetails> Handle(GetTourQuery query, CancellationToken ct)
    {
        await using var snapshot = await repository.BeginReadAsync(query.Id, ct);
        var tour = await repository.FindAsync(query.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var summary = await repository.GetSummaryAsync(query.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var usage = await repository.GetUsageAsync(query.Id, ct);
        var permissions = TourPreparation.Permissions(tour, usage);
        if (tour.RouteRevisionId is { } revisionId)
        {
            var revision = await RouteRevisionMapper.Load(revisions, tour.RouteId, revisionId, false, ct);
            var target = await repository.GetTargetAsync(tour.Id, ct);
            return new(summary, null, null, tour.FallbackVideoUrl, tour.StartedAt, tour.EndedAt, tour.EndReason,
                usage, permissions, revision, target.Operator, target.Reservation);
        }
        var route = await ReadRoute(tour.RouteId, ct);
        var active = tour.ActiveRouteId == tour.RouteId ? route : await ReadRoute(tour.ActiveRouteId, ct);
        return new(summary, route, active, tour.FallbackVideoUrl, tour.StartedAt, tour.EndedAt, tour.EndReason,
            usage, permissions, null, null, null);
    }

    private async Task<RouteDetails> ReadRoute(Guid id, CancellationToken ct)
    {
        var route = await routes.FindAsync(id, false, ct) ?? throw new NotFoundException("Không tìm thấy Route của Tour.");
        return RouteConfiguration.Details(route, await routes.GetUsageAsync(id, ct));
    }
}
