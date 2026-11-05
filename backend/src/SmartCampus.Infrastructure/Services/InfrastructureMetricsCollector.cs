using System.Diagnostics;
using System.Globalization;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Infrastructure;
using SmartCampus.Infrastructure.Persistence;

namespace SmartCampus.Infrastructure.Services;

/// <summary>
/// Read-only collector. Every section is measured independently; a failure in one
/// section is reported as that section's own unavailable state and never fabricated
/// or allowed to break the others. Metrics a platform cannot provide are null.
/// </summary>
public sealed class InfrastructureMetricsCollector : IInfrastructureMetricsCollector
{
    public const string BackupStatePathKey = "Monitoring:BackupStatePath";

    private static readonly DateTime ProcessStartTime = Process.GetCurrentProcess().StartTime.ToUniversalTime();
    private static (long Idle, long Total)? lastCpuSample;
    private static readonly object CpuLock = new();

    private readonly IApplicationDbContext dbContext;
    private readonly TimeProvider clock;
    private readonly IConfiguration? configuration;
    private readonly ILogger<InfrastructureMetricsCollector>? logger;

    public InfrastructureMetricsCollector(
        IApplicationDbContext dbContext,
        TimeProvider clock,
        IConfiguration? configuration = null,
        ILogger<InfrastructureMetricsCollector>? logger = null)
    {
        this.dbContext = dbContext;
        this.clock = clock;
        this.configuration = configuration;
        this.logger = logger;
    }

    public async Task<InfrastructureHealthDto> CollectAsync(CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();

        var host = Guard("host", () => CollectHostMetrics(), UnavailableHost());
        var runtime = Guard("runtime", () => CollectRuntimeMetrics(now), new BackendRuntimeMetrics("unknown", "unknown", 0, 0, 0, 0));
        var database = await CollectDatabaseMetricsAsync(cancellationToken);
        var docker = CollectDockerMetrics();
        var backup = Guard("backup", () => CollectBackupMetrics(now),
            new BackupHealthMetrics("UNKNOWN", null, null, null, null, "Không đọc được bằng chứng sao lưu."));

        return new InfrastructureHealthDto(now, host, runtime, database, docker, backup);
    }

    private T Guard<T>(string section, Func<T> collect, T fallback)
    {
        try
        {
            return collect();
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Infrastructure section {Section} could not be collected.", section);
            return fallback;
        }
    }

    private static HostSystemMetrics UnavailableHost() => new(
        "unknown", "unknown", "unknown", Environment.ProcessorCount, null, null, null,
        new HostDiskMetrics("/", "unknown", 0, 0, 0, 0, "UNAVAILABLE"), [], null, "UNAVAILABLE");

    private HostSystemMetrics CollectHostMetrics()
    {
        var cpuPercent = Guard("cpu", ReadHostCpuPercent, null);
        var memory = Guard("memory", ReadMemory, null);
        var disk = Guard("disk", ReadDisk,
            new HostDiskMetrics("/", "unknown", 0, 0, 0, 0, "UNAVAILABLE"));
        var network = Guard("network", ReadNetwork, (IReadOnlyList<NetworkInterfaceMetrics>)[]);

        var status = cpuPercent > 90 || memory?.UsedPercent > 95 || disk.UsedPercent > 95
            ? "WARNING"
            : "HEALTHY";

        return new HostSystemMetrics(
            Environment.MachineName,
            RuntimeInformation.OSDescription,
            RuntimeInformation.OSArchitecture.ToString(),
            Environment.ProcessorCount,
            cpuPercent,
            Guard("loadavg", ReadLoadAverages, null),
            memory,
            disk,
            network,
            Guard("uptime", ReadUptimeSeconds, null),
            status);
    }

    /// <summary>
    /// Host-wide CPU from /proc/stat deltas (Linux; /proc/stat is host-wide inside a container).
    /// Null on platforms without it and on the first sample after process start.
    /// </summary>
    private static double? ReadHostCpuPercent()
    {
        if (!File.Exists("/proc/stat")) return null;

        var line = File.ReadLines("/proc/stat").FirstOrDefault(l => l.StartsWith("cpu ", StringComparison.Ordinal));
        if (line is null) return null;

        var fields = line.Split(' ', StringSplitOptions.RemoveEmptyEntries).Skip(1)
            .Select(f => long.TryParse(f, NumberStyles.None, CultureInfo.InvariantCulture, out var v) ? v : 0)
            .ToArray();
        if (fields.Length < 5) return null;

        var idle = fields[3] + fields[4]; // idle + iowait
        var total = fields.Take(8).Sum();

        lock (CpuLock)
        {
            var previous = lastCpuSample;
            lastCpuSample = (idle, total);
            if (previous is null) return null;

            var totalDelta = total - previous.Value.Total;
            var idleDelta = idle - previous.Value.Idle;
            if (totalDelta <= 0) return null;

            return Math.Round(Math.Clamp((1.0 - (double)idleDelta / totalDelta) * 100.0, 0, 100), 1);
        }
    }

    private static double[]? ReadLoadAverages()
    {
        if (!File.Exists("/proc/loadavg")) return null;

        var parts = File.ReadAllText("/proc/loadavg").Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 3
            && double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var l1)
            && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var l5)
            && double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var l15))
        {
            return [l1, l5, l15];
        }

        return null;
    }

    private static double? ReadUptimeSeconds()
    {
        if (File.Exists("/proc/uptime"))
        {
            var parts = File.ReadAllText("/proc/uptime").Split(' ', StringSplitOptions.RemoveEmptyEntries);
            return parts.Length >= 1
                   && double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var uptime)
                ? Math.Round(uptime, 0)
                : null;
        }

        return RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? Math.Round(TimeSpan.FromMilliseconds(Environment.TickCount64).TotalSeconds, 0)
            : null;
    }

    private static HostMemoryMetrics? ReadMemory()
    {
        if (!File.Exists("/proc/meminfo")) return null;

        long total = 0, available = 0, free = 0, buffers = 0, cached = 0, swapFree = 0;
        long? swapTotal = null;

        foreach (var line in File.ReadLines("/proc/meminfo"))
        {
            var parts = line.Split(':', StringSplitOptions.TrimEntries);
            if (parts.Length != 2) continue;
            var valueText = parts[1].Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            if (!long.TryParse(valueText, NumberStyles.None, CultureInfo.InvariantCulture, out var kb)) continue;

            var bytes = kb * 1024;
            switch (parts[0])
            {
                case "MemTotal": total = bytes; break;
                case "MemAvailable": available = bytes; break;
                case "MemFree": free = bytes; break;
                case "Buffers": buffers = bytes; break;
                case "Cached": cached = bytes; break;
                case "SwapTotal": swapTotal = bytes; break;
                case "SwapFree": swapFree = bytes; break;
            }
        }

        if (total <= 0) return null;
        if (available == 0) available = free + buffers + cached;

        var used = Math.Max(0, total - available);
        long? swapUsed = swapTotal > 0 ? Math.Max(0, swapTotal.Value - swapFree) : null;
        double? swapPercent = swapUsed.HasValue ? Math.Round((double)swapUsed.Value / swapTotal!.Value * 100.0, 1) : null;

        return new HostMemoryMetrics(
            total, available, used, Math.Round((double)used / total * 100.0, 1),
            swapTotal, swapUsed, swapPercent);
    }

    private static HostDiskMetrics ReadDisk()
    {
        var drives = DriveInfo.GetDrives()
            .Where(d => d.IsReady && (d.DriveType == DriveType.Fixed || d.DriveType == DriveType.Network))
            .ToArray();

        var primary = drives.FirstOrDefault(d => d.RootDirectory.FullName == "/"
                || d.RootDirectory.FullName.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase))
            ?? drives.FirstOrDefault();

        if (primary is null || primary.TotalSize <= 0)
        {
            return new HostDiskMetrics("/", "unknown", 0, 0, 0, 0, "UNAVAILABLE");
        }

        var total = primary.TotalSize;
        var free = primary.AvailableFreeSpace;
        var used = Math.Max(0, total - free);
        var pct = Math.Round((double)used / total * 100.0, 1);
        var status = pct > 90 ? "DANGER" : pct > 80 ? "WARNING" : "HEALTHY";
        return new HostDiskMetrics(primary.Name, primary.DriveFormat, total, free, used, pct, status);
    }

    private static IReadOnlyList<NetworkInterfaceMetrics> ReadNetwork()
    {
        var results = new List<NetworkInterfaceMetrics>();
        foreach (var iface in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (iface.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

            long received = 0, sent = 0;
            try
            {
                var stats = iface.GetIPStatistics();
                received = stats.BytesReceived;
                sent = stats.BytesSent;
            }
            catch (Exception ex) when (ex is NetworkInformationException or PlatformNotSupportedException)
            {
                // Statistics are not supported on this interface; counters stay 0.
            }

            results.Add(new NetworkInterfaceMetrics(
                iface.Name, iface.Description, iface.OperationalStatus.ToString(), received, sent));
        }

        return results;
    }

    private static BackendRuntimeMetrics CollectRuntimeMetrics(DateTimeOffset now)
    {
        using var process = Process.GetCurrentProcess();
        var uptime = Math.Max(0, (now.UtcDateTime - ProcessStartTime).TotalSeconds);
        var envName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";

        return new BackendRuntimeMetrics(
            RuntimeInformation.FrameworkDescription,
            envName,
            Math.Round(uptime, 0),
            process.WorkingSet64,
            GC.GetTotalMemory(false),
            ThreadPool.ThreadCount);
    }

    private async Task<DatabaseHealthMetrics> CollectDatabaseMetricsAsync(CancellationToken cancellationToken)
    {
        const string provider = "Microsoft.EntityFrameworkCore.SqlServer";
        var sw = Stopwatch.StartNew();
        try
        {
            if (dbContext is not ApplicationDbContext appDb)
            {
                return new DatabaseHealthMetrics("UNAVAILABLE", false, null, "Unknown", "Database check is not available.");
            }

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(3));
            var canConnect = await appDb.Database.CanConnectAsync(cts.Token);
            sw.Stop();

            return new DatabaseHealthMetrics(
                canConnect ? "ONLINE" : "UNAVAILABLE",
                canConnect,
                canConnect ? Math.Round(sw.Elapsed.TotalMilliseconds, 1) : null,
                appDb.Database.ProviderName ?? provider,
                canConnect ? null : "Could not connect to database server.");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Database connectivity check failed.");
            // Never return the raw exception text: it may contain server names or connection details.
            return new DatabaseHealthMetrics("UNAVAILABLE", false, null, provider,
                "Database connectivity check failed or timed out.");
        }
    }

    // The API runs in a hardened container (read-only root, cap_drop ALL) with no Docker
    // socket by design (backend/docker-compose.yml). Mounting the socket would give the
    // API root-equivalent control of the host, so container state is not collected here
    // and nothing is invented. Container health is covered by the host-side
    // campustour-check timer and compose healthchecks.
    private static DockerStackMetrics CollectDockerMetrics() => new(
        "NOT_MONITORED",
        "API chạy trong container không có Docker socket (chủ ý, vì lý do bảo mật). "
        + "Trạng thái container do host-check của máy chủ theo dõi, không hiển thị tại đây.",
        0, 0, 0, []);

    private BackupHealthMetrics CollectBackupMetrics(DateTimeOffset now)
    {
        var path = configuration?[BackupStatePathKey];
        if (string.IsNullOrWhiteSpace(path))
        {
            return new BackupHealthMetrics("UNKNOWN", null, null, null, null,
                "Chưa cấu hình đường dẫn bằng chứng sao lưu cho API (Monitoring:BackupStatePath); "
                + "không thể xác nhận bản sao lưu từ đây.");
        }

        string content;
        try
        {
            if (!File.Exists(path))
            {
                return new BackupHealthMetrics("UNKNOWN", null, null, null, null,
                    "API không thấy marker sao lưu (chưa mount, chưa có bản sao lưu nào hoặc sai đường dẫn).");
            }

            content = File.ReadAllText(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger?.LogWarning(ex, "Backup state marker could not be read.");
            return new BackupHealthMetrics("UNKNOWN", null, null, null, null,
                "API không đọc được marker sao lưu (thiếu quyền hoặc lỗi I/O).");
        }

        return BackupEvidence.Evaluate(content, now);
    }
}
