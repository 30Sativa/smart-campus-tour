using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record GetMapVersionQuery(Guid Id) : IRequest<MapVersionListItem>;
public sealed class GetMapVersionQueryHandler(IMapVersionRepository repository, MapPoiSettings settings)
    : IRequestHandler<GetMapVersionQuery, MapVersionListItem>
{
    public async Task<MapVersionListItem> Handle(GetMapVersionQuery query, CancellationToken ct)
    {
        var map = await repository.FindMapVersionAsync(query.Id, false, ct)
            ?? throw new NotFoundException("Map version", query.Id);
        var eligibility = await MapPreparationEligibility.LoadAsync(repository, map, ct);
        var currentDeployments = await repository.ListLatestDeploymentChecksForPhysicalRobotsAsync(ct);
        return new(MapPoiReadModelMapper.ToMapView(map, map.AreaKeyNavigation.DisplayName),
            eligibility.LatestDeployment is null ? null : MapPoiReadModelMapper.ToDeploymentView(eligibility.LatestDeployment), eligibility.TechnicalCheckStatus,
            eligibility.CanUseForPoiPreparation, eligibility.BlockReasonCode, eligibility.BlockReason,
            eligibility.Evidence is null ? null : MapPoiReadModelMapper.ToDeploymentView(eligibility.Evidence),
            MapCurrentlyDeployedOn.ForMap(map, currentDeployments), settings.PoiClearanceMeters);
    }
}
