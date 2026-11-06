using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Queries.GetTours;

public sealed class GetToursQueryHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, IMapVersionRepository maps, TimeProvider clock) : IRequestHandler<GetToursQuery, PagedResult<TourSummary>>
{
    public async Task<PagedResult<TourSummary>> Handle(GetToursQuery query, CancellationToken ct)
    {
        var page = await repository.ListAsync(query.Request with { Now = clock.GetUtcNow() }, ct);
        if (!query.Request.IncludeReadyBlockers) return page;

        // The READY checks the Tour detail shows, without locks: advisory, Mark READY rechecks them all.
        // Only a SCHEDULED Tour can become READY, so the other rows keep null.
        var rows = new List<TourSummary>(page.Items.Count);
        foreach (var row in page.Items)
        {
            if (row.State != "SCHEDULED" || await repository.FindAsync(row.Id, ct) is not { } tour)
            {
                rows.Add(row);
                continue;
            }
            var usage = await repository.GetUsageAsync(row.Id, ct);
            var blockers = await TourReadiness.EvaluateAsync(tour, usage, repository, registrations, revisions, maps, clock, lockTarget: false, ct);
            rows.Add(row with { ReadyBlockers = blockers });
        }
        return page with { Items = rows };
    }
}
