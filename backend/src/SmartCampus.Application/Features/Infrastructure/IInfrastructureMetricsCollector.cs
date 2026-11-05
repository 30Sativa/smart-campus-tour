using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Infrastructure;

public interface IInfrastructureMetricsCollector
{
    Task<InfrastructureHealthDto> CollectAsync(CancellationToken cancellationToken);
}

public sealed record GetInfrastructureHealthQuery : IQuery<InfrastructureHealthDto>;

public sealed record InfrastructureHealthDto(
    DateTimeOffset CollectedAt,
    HostSystemMetrics Host,
    BackendRuntimeMetrics Runtime,
    DatabaseHealthMetrics Database,
    DockerStackMetrics Docker,
    BackupHealthMetrics Backup);

public sealed record HostSystemMetrics(
    string MachineName,
    string OsDescription,
    string OsArchitecture,
    int ProcessorCount,
    double? CpuPercent,
    double[]? LoadAverages,
    HostMemoryMetrics Memory,
    HostDiskMetrics Disk,
    IReadOnlyList<NetworkInterfaceMetrics> Network,
    double? HostUptimeSeconds,
    string Status);

public sealed record HostMemoryMetrics(
    long TotalBytes,
    long AvailableBytes,
    long UsedBytes,
    double UsedPercent,
    long? SwapTotalBytes,
    long? SwapUsedBytes,
    double? SwapUsedPercent);

public sealed record HostDiskMetrics(
    string MountPoint,
    string DriveFormat,
    long TotalBytes,
    long AvailableFreeBytes,
    long UsedBytes,
    double UsedPercent,
    string Status);

public sealed record NetworkInterfaceMetrics(
    string Name,
    string Description,
    string Status,
    long BytesReceived,
    long BytesSent);

public sealed record BackendRuntimeMetrics(
    string FrameworkVersion,
    string Environment,
    double ProcessUptimeSeconds,
    long WorkingSetBytes,
    long GcTotalMemoryBytes,
    int ThreadCount);

public sealed record DatabaseHealthMetrics(
    string Status, // "ONLINE", "DEGRADED", "UNAVAILABLE"
    bool CanConnect,
    double? LatencyMs,
    string Provider,
    string? Error);

public sealed record DockerStackMetrics(
    string Status, // "ONLINE", "UNAVAILABLE", "NOT_CONFIGURED"
    string? Message,
    int TotalContainers,
    int RunningContainers,
    int UnhealthyContainers,
    IReadOnlyList<ContainerMetrics> Containers);

public sealed record ContainerMetrics(
    string Name,
    string State, // "running", "exited", "restarting"
    string Health, // "healthy", "unhealthy", "starting", "none"
    int Restarts,
    long? MemoryUsageBytes);

public sealed record BackupHealthMetrics(
    string Status, // "HEALTHY", "WARNING", "STALE", "NOT_RECORDED"
    string? LastBackupTimestamp,
    double? AgeHours,
    string? Target,
    long? SizeBytes,
    string? Message);
