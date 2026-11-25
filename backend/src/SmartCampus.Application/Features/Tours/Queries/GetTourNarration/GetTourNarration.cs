using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Queries.GetTourNarration;

/// <summary>ADR-0067: each stop's narration in the Tour and the newest approved one, and whether Staff may refresh now.</summary>
public sealed record GetTourNarrationQuery(Guid Id) : IRequest<TourNarrationStatus>;

public sealed class GetTourNarrationQueryHandler(ITourManagementRepository tours, IRouteRevisionRepository revisions)
    : IRequestHandler<GetTourNarrationQuery, TourNarrationStatus>
{
    public async Task<TourNarrationStatus> Handle(GetTourNarrationQuery query, CancellationToken ct)
    {
        var tour = await tours.FindAsync(query.Id, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var permissions = TourPreparation.Permissions(tour, await tours.GetUsageAsync(tour.Id, ct));
        var plan = tour.RouteRevisionId is { } revisionId ? await TourNarrationRefresh.PlanAsync(revisions, revisionId, ct) : null;
        var blocked = TourNarrationRefresh.Blocker(tour, permissions, plan);
        return new TourNarrationStatus(tour.Id, plan?.TourRevision.Id, plan?.TourRevision.RevisionNumber, blocked is null,
            blocked?.Code, blocked?.Message, plan?.Stops ?? []);
    }
}
