using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.Application.Features.FleetHead.Queries.GetRobotHeadPois;

public sealed class GetRobotHeadPoisQueryHandler(IRobotHeadPoiReader reader, ITourHeadModeStore modes, FleetHeadSettings settings)
    : IRequestHandler<GetRobotHeadPoisQuery, RobotHeadPois>
{
    public async Task<RobotHeadPois> Handle(GetRobotHeadPoisQuery query, CancellationToken ct)
    {
        var set = await reader.GetAsync(query.RobotCode, ct)
                  ?? new RobotHeadPoiSet(RobotHeadPoiSources.None, null, null, []);
        var mode = set.TourId is { } tourId ? modes.GetMode(tourId) : settings.DefaultMode;
        var pois = set.Pois
            .Select(poi => new RobotHeadPoi(poi.Id, poi.Name, (double)poi.X, (double)poi.Y, (double)poi.Yaw,
                PoiCameraPresets.Normalize(poi.CameraPreset) ?? PoiCameraPresets.None))
            .ToArray();
        return new RobotHeadPois(set.Source, set.TourId, set.MapVersionId, mode,
            settings.Enabled && mode == HeadModes.Auto, pois);
    }
}
