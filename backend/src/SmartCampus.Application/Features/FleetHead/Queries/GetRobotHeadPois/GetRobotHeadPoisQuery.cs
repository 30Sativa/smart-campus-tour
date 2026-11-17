using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.FleetHead.Queries.GetRobotHeadPois;

/// <summary>
/// ADR-0045 addendum 14/11/2026: the robot reads its POIs and their camera presets, then turns the head by itself when
/// Nav2 reaches one (docs/contracts/fleet-head/v1, <c>GET /api/fleet/head/v1/pois</c>).
/// </summary>
public sealed record GetRobotHeadPoisQuery(string RobotCode) : IQuery<RobotHeadPois>;

public static class RobotHeadPoiSources
{
    public const string Tour = "TOUR";
    public const string Map = "MAP";
    public const string None = "NONE";
}

/// <param name="AutoMotion">True when <c>FleetHead:Enabled</c> and the head mode (the running Tour's, or
/// <c>FleetHead:DefaultMode</c> without one) is AUTO: only then may the robot turn the head by itself.</param>
public sealed record RobotHeadPois(string Source, Guid? TourId, Guid? MapVersionId, string Mode, bool AutoMotion,
    IReadOnlyList<RobotHeadPoi> Pois);

/// <summary><see cref="CameraPreset"/> is canonical (<c>PoiCameraPresets</c>); an older unknown value is sent as NONE.</summary>
public sealed record RobotHeadPoi(Guid Id, string Name, double X, double Y, double Yaw, string CameraPreset);
