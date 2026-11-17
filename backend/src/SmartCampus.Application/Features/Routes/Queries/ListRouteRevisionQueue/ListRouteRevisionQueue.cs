using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

public sealed record ListRouteRevisionQueueQuery() : IRequest<IReadOnlyList<RouteRevisionView>>;

/// <summary>Current revisions whose effective PASS was measured before dwell was included, so they cannot be scheduled (ADR-0048).</summary>
public sealed record ListRouteRerunQueueQuery() : IRequest<IReadOnlyList<RouteRevisionView>>;

public sealed class ListRouteRerunQueueHandler(IRouteRevisionRepository repo, Tours.TourScheduleSettings schedule) : IRequestHandler<ListRouteRerunQueueQuery, IReadOnlyList<RouteRevisionView>>
{
    public async Task<IReadOnlyList<RouteRevisionView>> Handle(ListRouteRerunQueueQuery q, CancellationToken ct)
    {
        var current = await repo.ListCurrentRevisionIdsAsync(null, null, "name", 1, 100, ct, isActive: true);
        var views = new List<RouteRevisionView>();
        foreach (var id in current.Items)
        {
            if (await repo.FindRevisionAsync(id, ct) is not { } revision) continue;
            var view = await RouteRevisionMapper.Load(repo, revision.RouteId, revision.Id, false, ct, schedule);
            if (view.VerificationStatus == "PASS" && view.TestRuns.SingleOrDefault(run => run.Id == view.EffectiveTestRunId) is { MeasurementBasis: null })
                views.Add(view);
        }
        return views;
    }
}

public sealed class ListRouteRevisionQueueHandler(IRouteRevisionRepository repo, Tours.TourScheduleSettings schedule) : IRequestHandler<ListRouteRevisionQueueQuery, IReadOnlyList<RouteRevisionView>>
{
    public async Task<IReadOnlyList<RouteRevisionView>> Handle(ListRouteRevisionQueueQuery q, CancellationToken ct)
    {
        var revisions = await repo.ListSubmittedPendingAsync(ct);
        var views = new List<RouteRevisionView>(revisions.Count);
        foreach (var item in revisions)
        {
            var view = await RouteRevisionMapper.Load(repo, item.RouteId, item.Id, false, ct, schedule);
            // A save that only changed dwell or narration already has the result of its path (ADR-0023 addendum): it is not
            // waiting for a first run, and the passed or failed list shows it with that result.
            if (view.VerificationStatus is not ("PASS" or "FAIL")) views.Add(view);
        }
        return views;
    }
}
