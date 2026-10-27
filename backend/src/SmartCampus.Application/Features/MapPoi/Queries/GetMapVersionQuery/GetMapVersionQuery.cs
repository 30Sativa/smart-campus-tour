using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record GetMapVersionQuery(Guid Id) : IRequest<MapVersionListItem>;
public sealed class GetMapVersionQueryHandler(IMapVersionRepository repository)
    : IRequestHandler<GetMapVersionQuery, MapVersionListItem>
{
    public async Task<MapVersionListItem> Handle(GetMapVersionQuery query, CancellationToken ct)
    {
        var map = await repository.FindMapVersionAsync(query.Id, false, ct)
            ?? throw new NotFoundException("Map version", query.Id);
        var latest = await repository.GetLatestDeploymentCheckAsync(map.Id, null, ct);
        return new(MapPoiReadModelMapper.ToMapView(map, map.AreaKeyNavigation.DisplayName),
            latest is null ? null : MapPoiReadModelMapper.ToDeploymentView(latest));
    }
}
