using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record ListMapDeploymentChecksQuery(Guid MapVersionId) : IRequest<IReadOnlyList<MapDeploymentCheckView>>;
public sealed class ListMapDeploymentChecksQueryHandler(IMapVersionRepository repository)
    : IRequestHandler<ListMapDeploymentChecksQuery, IReadOnlyList<MapDeploymentCheckView>>
{
    public async Task<IReadOnlyList<MapDeploymentCheckView>> Handle(ListMapDeploymentChecksQuery query, CancellationToken ct)
    {
        if (await repository.FindMapVersionAsync(query.MapVersionId, false, ct) is null)
            throw new NotFoundException("Map version", query.MapVersionId);
        return (await repository.ListDeploymentChecksAsync(query.MapVersionId, ct)).Select(MapPoiReadModelMapper.ToDeploymentView).ToArray();
    }
}
