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

/// <summary>
/// Evaluates the state marker written by backend/deploy/backup-sqlserver.sh, which is
/// only written after RESTORE VERIFYONLY and SHA-256 checks. Format (tab separated):
/// timestamp (yyyyMMddTHHmmssZ), target, size bytes, sha256.
/// </summary>
public static class BackupEvidence
{
    public const double StaleAfterHours = 26;

    public static BackupHealthMetrics Evaluate(string? content, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return new BackupHealthMetrics("INVALID", null, null, null, null,
                "Marker sao lưu rỗng; không dùng làm bằng chứng.");
        }

        var parts = content.Trim().Split('\t', StringSplitOptions.TrimEntries);
        if (parts.Length != 4
            || !DateTimeOffset.TryParseExact(parts[0], "yyyyMMdd'T'HHmmss'Z'",
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                out var at)
            || !long.TryParse(parts[2], System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture, out var size) || size <= 0
            || parts[3].Length != 64 || !parts[3].All(Uri.IsHexDigit)
            || string.IsNullOrWhiteSpace(parts[1]))
        {
            return new BackupHealthMetrics("INVALID", null, null, null, null,
                "Marker sao lưu không đúng định dạng đã xác minh; không dùng làm bằng chứng.");
        }

        var age = (now - at).TotalHours;
        if (age < -0.1)
        {
            return new BackupHealthMetrics("INVALID", null, null, null, null,
                "Thời điểm sao lưu nằm trong tương lai; marker không đáng tin.");
        }

        age = Math.Max(0, age);
        var stale = age > StaleAfterHours;
        return new BackupHealthMetrics(
            stale ? "STALE" : "HEALTHY",
            at.ToString("O", System.Globalization.CultureInfo.InvariantCulture),
            Math.Round(age, 1),
            parts[1],
            size,
            stale
                ? "Bản sao lưu đã xác minh gần nhất quá 26 giờ."
                : "Bản sao lưu gần nhất đã qua RESTORE VERIFYONLY và kiểm tra SHA-256.");
    }
}

public sealed record HostSystemMetrics(
    string MachineName,
    string OsDescription,
    string OsArchitecture,
    int ProcessorCount,
    double? CpuPercent,
    double[]? LoadAverages,
    HostMemoryMetrics? Memory,
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
    string Status, // "NOT_MONITORED" (no safe collector), "UNAVAILABLE"; "ONLINE" reserved
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
    string Status, // "HEALTHY", "STALE", "UNKNOWN" (evidence not visible), "INVALID"
    string? LastBackupTimestamp,
    double? AgeHours,
    string? Target,
    long? SizeBytes,
    string? Message);
