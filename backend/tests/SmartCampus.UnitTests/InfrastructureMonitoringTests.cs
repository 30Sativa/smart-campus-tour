using SmartCampus.Application.Features.Infrastructure;

namespace SmartCampus.UnitTests;

public sealed class InfrastructureMonitoringTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 5, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task GetInfrastructureHealth_ReturnsCompleteMetrics_WhenDatabaseAvailable()
    {
        var expected = new InfrastructureHealthDto(
            Now,
            new HostSystemMetrics("test-host", "Linux 6.8", "X64", 4, 15.2, [0.5, 0.4, 0.3],
                new HostMemoryMetrics(4096000000, 2048000000, 2048000000, 50.0, null, null, null),
                new HostDiskMetrics("/", "ext4", 50000000000, 25000000000, 25000000000, 50.0, "HEALTHY"),
                [new NetworkInterfaceMetrics("eth0", "Ethernet", "Up", 100000, 50000)],
                3600, "HEALTHY"),
            new BackendRuntimeMetrics(".NET 10.0.0", "Development", 1200, 150000000, 80000000, 24),
            new DatabaseHealthMetrics("ONLINE", true, 4.2, "Microsoft.EntityFrameworkCore.SqlServer", null),
            new DockerStackMetrics("ONLINE", "Docker daemon available", 2, 2, 0,
                [new ContainerMetrics("campustour-api", "running", "healthy", 0, null)]),
            new BackupHealthMetrics("HEALTHY", "20261105T060000Z", 2.0, "s3://backups", 1048576, "Backup healthy"));

        var collector = new StubMetricsCollector(expected);
        var handler = new GetInfrastructureHealthQueryHandler(collector);
        var result = await handler.Handle(new GetInfrastructureHealthQuery(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("test-host", result.Host.MachineName);
        Assert.Equal("ONLINE", result.Database.Status);
        Assert.True(result.Database.CanConnect);
        Assert.Equal(4.2, result.Database.LatencyMs);
        Assert.Equal(50.0, result.Host.Memory.UsedPercent);
    }

    [Fact]
    public async Task GetInfrastructureHealth_PreservesHostMetrics_WhenDatabaseFails()
    {
        // Demonstrates Core Requirement: Independent Data Availability
        var degraded = new InfrastructureHealthDto(
            Now,
            new HostSystemMetrics("test-host", "Linux 6.8", "X64", 4, 15.2, null,
                new HostMemoryMetrics(4096000000, 2048000000, 2048000000, 50.0, null, null, null),
                new HostDiskMetrics("/", "ext4", 50000000000, 25000000000, 25000000000, 50.0, "HEALTHY"),
                [], 3600, "HEALTHY"),
            new BackendRuntimeMetrics(".NET 10.0.0", "Development", 1200, 150000000, 80000000, 24),
            new DatabaseHealthMetrics("UNAVAILABLE", false, null, "Microsoft.EntityFrameworkCore.SqlServer", "Connection refused"),
            new DockerStackMetrics("UNAVAILABLE", "Docker socket not accessible", 0, 0, 0, []),
            new BackupHealthMetrics("NOT_RECORDED", null, null, null, null, "No backup file found"));

        var collector = new StubMetricsCollector(degraded);
        var handler = new GetInfrastructureHealthQueryHandler(collector);
        var result = await handler.Handle(new GetInfrastructureHealthQuery(), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("UNAVAILABLE", result.Database.Status);
        Assert.False(result.Database.CanConnect);
        // Host and Runtime metrics are still 100% available and valid!
        Assert.Equal("test-host", result.Host.MachineName);
        Assert.Equal(50.0, result.Host.Memory.UsedPercent);
        Assert.Equal(1200, result.Runtime.ProcessUptimeSeconds);
    }

    private sealed class StubMetricsCollector(InfrastructureHealthDto dto) : IInfrastructureMetricsCollector
    {
        public Task<InfrastructureHealthDto> CollectAsync(CancellationToken cancellationToken) =>
            Task.FromResult(dto);
    }
}
