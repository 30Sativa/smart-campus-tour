namespace SmartCampus.Application.Features.RobotDiagnostics;

public sealed record RobotDiagnosticsSnapshot(
    string RobotCode,
    DateTimeOffset ReportedAt,
    DateTimeOffset ReceivedAt,
    MiniPcResourcesReport? MiniPc,
    Ros2SystemReport? Ros2,
    SensorHealthReport? Sensors);

public sealed record MiniPcResourcesReport(
    double? CpuPercent,
    MemoryMetric? Memory,
    GpuMetric? Gpu,
    DiskMetric? Disk,
    double? CpuTemperatureCelsius);

public sealed record MemoryMetric(
    long TotalBytes,
    long AvailableBytes,
    long UsedBytes,
    double UsedPercent);

public sealed record GpuMetric(
    bool Supported,
    double? UtilizationPercent,
    double? TemperatureCelsius,
    double? MemoryUsedPercent,
    string? ModelName);

public sealed record DiskMetric(
    string MountPoint,
    long TotalBytes,
    long AvailableFreeBytes,
    double UsedPercent);

public sealed record Ros2SystemReport(
    string MiddlewareStatus, // "OK", "DEGRADED", "ERROR"
    IReadOnlyList<Ros2NodeStatus> Nodes,
    bool? TfValid,
    string? Nav2State); // "IDLE", "NAVIGATING", "ARRIVED", "FAILED", "UNKNOWN"

public sealed record Ros2NodeStatus(
    string NodeName,
    string State, // "ACTIVE", "INACTIVE", "UNRESPONSIVE"
    double? RateHz);

public sealed record SensorHealthReport(
    SensorStatus Lidar,
    ImuSensorStatus Imu,
    SensorStatus Odometry,
    SensorStatus DepthCamera);

public sealed record SensorStatus(
    string Status, // "OK", "WARN", "ERROR", "STALE", "UNKNOWN", "NOT_EQUIPPED"
    string? Message,
    double? RateHz,
    DateTimeOffset? LastValidAt);

public sealed record ImuSensorStatus(
    string Status, // "OK", "WARN", "ERROR", "STALE", "UNKNOWN"
    string? Message,
    bool? YawValid,
    int? FirmwareRearmCount,
    int? FirmwareResetSeenCount,
    int Outages,
    DateTimeOffset? LastValidAt);
