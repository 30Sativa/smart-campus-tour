using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record MapAreaOption(string AreaKey, string DisplayName);

public sealed record ListMapAreasQuery : IRequest<IReadOnlyList<MapAreaOption>>;

public sealed class ListMapAreasQueryHandler(IMapVersionRepository repository)
    : IRequestHandler<ListMapAreasQuery, IReadOnlyList<MapAreaOption>>
{
    public async Task<IReadOnlyList<MapAreaOption>> Handle(ListMapAreasQuery query, CancellationToken ct)
    {
        var areas = await repository.ListMapAreasAsync(ct);
        return areas.Select(area => new MapAreaOption(area.AreaKey, area.DisplayName)).ToArray();
    }
}
