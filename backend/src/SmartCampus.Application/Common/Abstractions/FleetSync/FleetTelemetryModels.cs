namespace SmartCampus.Application.Common.Abstractions.FleetSync;

public sealed record FleetPose(double X, double Y, double Yaw, DateTimeOffset CapturedAt);

public sealed record FleetTelemetryReport(
    string RobotId,
    Guid StreamId,
    long Seq,
    DateTimeOffset ReportedAt,
    string MapKey,
    string FrameId,
    FleetPose? Pose,
    string Status,
    Guid? LegId,
    bool? Localized,
    bool? MotionReady,
    string? FaultCode,
    double? BatteryPercent);

public sealed record FleetTelemetrySnapshot(
    FleetRobotIdentity Robot,
    FleetTelemetryReport Report,
    DateTimeOffset ReceivedAt);
