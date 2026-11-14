namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>One POI the robot may stop at, with the camera preset Staff set for it (route stop or POI revision).</summary>
public sealed record RobotHeadPoiView(Guid Id, string Name, decimal X, decimal Y, decimal Yaw, string CameraPreset);

/// <summary>
/// Where the robot's POIs come from: the stops of its RUNNING Tour (presets frozen in the route revision), otherwise the
/// latest PASS revision of every POI on the map assigned to the robot, otherwise nothing.
/// </summary>
public sealed record RobotHeadPoiSet(string Source, Guid? TourId, Guid? MapVersionId, IReadOnlyList<RobotHeadPoiView> Pois);

public interface IRobotHeadPoiReader
{
    /// <summary>Null when no physical robot has this code.</summary>
    Task<RobotHeadPoiSet?> GetAsync(string robotCode, CancellationToken cancellationToken);
}
