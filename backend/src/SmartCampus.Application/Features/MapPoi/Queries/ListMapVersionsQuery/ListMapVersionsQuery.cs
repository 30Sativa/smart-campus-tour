using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record ListMapVersionsQuery(string? AreaKey, int Take) : IRequest<IReadOnlyList<MapVersionListItem>>;
public sealed class ListMapVersionsQueryHandler(IMapVersionRepository repository)
    : IRequestHandler<ListMapVersionsQuery, IReadOnlyList<MapVersionListItem>>
{
    public async Task<IReadOnlyList<MapVersionListItem>> Handle(ListMapVersionsQuery query, CancellationToken ct)
    {
        if (query.Take is < 1 or > 100) throw new FluentValidation.ValidationException("Take must be between 1 and 100.");
        var maps = await repository.ListMapVersionsAsync(query.AreaKey, query.Take, ct);
        var result = new List<MapVersionListItem>(maps.Count);
        foreach (var map in maps)
        {
            var eligibility = await MapPreparationEligibility.LoadAsync(repository, map, ct);
            result.Add(new(MapPoiReadModelMapper.ToMapView(map, map.AreaKeyNavigation.DisplayName),
                eligibility.LatestDeployment is null ? null : MapPoiReadModelMapper.ToDeploymentView(eligibility.LatestDeployment), eligibility.TechnicalCheckStatus,
                eligibility.CanUseForPoiPreparation, eligibility.BlockReasonCode, eligibility.BlockReason,
                eligibility.Evidence is null ? null : MapPoiReadModelMapper.ToDeploymentView(eligibility.Evidence)));
        }
        return result;
    }
}
