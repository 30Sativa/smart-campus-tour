using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Behaviors;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.FleetSync.Commands.SyncFleetTelemetry;

namespace SmartCampus.UnitTests;

public sealed class UnitOfWorkBehaviorTests
{
    [Fact]
    public async Task Handle_Command_CommitsAfterHandlerSucceeds()
    {
        var dbContext = new RecordingDbContext();
        var serviceProvider = new RecordingServiceProvider(dbContext);
        var behavior = new UnitOfWorkBehavior<TestCommand, string>(serviceProvider);

        var response = await behavior.Handle(
            new TestCommand(),
            _ => Task.FromResult("handled"),
            CancellationToken.None);

        Assert.Equal("handled", response);
        Assert.Equal(1, dbContext.SaveChangesCalls);
        Assert.Equal(1, serviceProvider.DbContextResolutionCount);
    }

    [Fact]
    public async Task Handle_Query_DoesNotResolvePersistenceOrCommit()
    {
        var dbContext = new RecordingDbContext();
        var serviceProvider = new RecordingServiceProvider(dbContext);
        var behavior = new UnitOfWorkBehavior<TestQuery, string>(serviceProvider);

        var response = await behavior.Handle(
            new TestQuery(),
            _ => Task.FromResult("handled"),
            CancellationToken.None);

        Assert.Equal("handled", response);
        Assert.Equal(0, dbContext.SaveChangesCalls);
        Assert.Equal(0, serviceProvider.DbContextResolutionCount);
    }

    [Fact]
    public async Task Handle_FleetTelemetry_DoesNotResolvePersistenceOrCommit()
    {
        var dbContext = new RecordingDbContext();
        var serviceProvider = new RecordingServiceProvider(dbContext);
        var behavior = new UnitOfWorkBehavior<SyncFleetTelemetry, SyncFleetTelemetryResult>(serviceProvider);
        var robot = new FleetRobotIdentity("robot_01", "PHYSICAL", null, false);
        var report = new FleetTelemetryReport("robot_01", Guid.NewGuid(), 1, DateTimeOffset.UtcNow,
            "test-map", "map", null, "IDLE", null, null, null, null, null);
        var snapshot = new FleetTelemetrySnapshot(robot, report, DateTimeOffset.UtcNow);

        var response = await behavior.Handle(
            new SyncFleetTelemetry(robot, report, new byte[32]),
            _ => Task.FromResult(new SyncFleetTelemetryResult(false, snapshot.ReceivedAt, snapshot)),
            CancellationToken.None);

        Assert.Same(snapshot, response.Snapshot);
        Assert.Equal(0, dbContext.SaveChangesCalls);
        Assert.Equal(0, serviceProvider.DbContextResolutionCount);
    }

    [Fact]
    public async Task Handle_FailedCommand_DoesNotCommit()
    {
        var dbContext = new RecordingDbContext();
        var serviceProvider = new RecordingServiceProvider(dbContext);
        var behavior = new UnitOfWorkBehavior<TestCommand, string>(serviceProvider);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            behavior.Handle(
                new TestCommand(),
                _ => throw new InvalidOperationException("Handler failed."),
                CancellationToken.None));

        Assert.Equal(0, dbContext.SaveChangesCalls);
        Assert.Equal(0, serviceProvider.DbContextResolutionCount);
    }

    private sealed record TestCommand : ICommand<string>;

    private sealed record TestQuery : IQuery<string>;

    private sealed class RecordingDbContext : IApplicationDbContext
    {
        public int SaveChangesCalls { get; private set; }

        public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            SaveChangesCalls++;
            return Task.FromResult(1);
        }
    }

    private sealed class RecordingServiceProvider(
        IApplicationDbContext dbContext) : IServiceProvider
    {
        public int DbContextResolutionCount { get; private set; }

        public object? GetService(Type serviceType)
        {
            if (serviceType != typeof(IApplicationDbContext))
            {
                return null;
            }

            DbContextResolutionCount++;
            return dbContext;
        }
    }
}
