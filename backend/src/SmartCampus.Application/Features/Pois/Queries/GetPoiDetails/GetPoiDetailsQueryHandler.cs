using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Pois.Dtos;

namespace SmartCampus.Application.Features.Pois.Queries.GetPoiDetails;

public sealed class GetPoiDetailsQueryHandler(IPoiManagementRepository repository)
    : IRequestHandler<GetPoiDetailsQuery, PoiDetailsResponse>
{
    public async Task<PoiDetailsResponse> Handle(GetPoiDetailsQuery query, CancellationToken cancellationToken)
    {
        var poi = await repository.FindForReadAsync(query.Id, cancellationToken)
            ?? throw new NotFoundException("POI was not found.");
        var state = await repository.GetManagementStateAsync(poi.Id, cancellationToken);

        return new PoiDetailsResponse(
            poi.Id,
            poi.Name,
            poi.Description,
            poi.MapKey,
            poi.MapFrame,
            poi.X,
            poi.Y,
            poi.Yaw,
            poi.NarrationText,
            poi.AudioUrl,
            poi.NarrationSeconds,
            poi.FallbackVideoUrl,
            poi.IsActive,
            poi.CreatedAt,
            poi.UpdatedAt,
            Convert.ToBase64String(poi.RowVersion),
            new PoiUsageResponse(
                state.HasRouteStopReferences,
                state.HasHistoricalTourReferences,
                state.HasReadyOrRunningTours,
                state.CanEditPose,
                state.CanEditContentAndAvailability));
    }
}
