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

public sealed class ListRouteRevisionQueueHandler(IRouteRevisionRepository repo) : IRequestHandler<ListRouteRevisionQueueQuery, IReadOnlyList<RouteRevisionView>>
{
    public async Task<IReadOnlyList<RouteRevisionView>> Handle(ListRouteRevisionQueueQuery q, CancellationToken ct)
    {
        var revisions = await repo.ListSubmittedPendingAsync(ct);
        var views = new List<RouteRevisionView>(revisions.Count);
        foreach (var item in revisions) views.Add(await RouteRevisionMapper.Load(repo, item.RouteId, item.Id, false, ct));
        return views;
    }
}
