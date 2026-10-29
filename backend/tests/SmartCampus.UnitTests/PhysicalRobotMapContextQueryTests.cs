using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class PhysicalRobotMapContextQueryTests
{
    [Fact]
    public async Task List_query_returns_configured_context_and_latest_deployed_map_metadata_without_other_settings()
    {
        var configured = new Robot { Id = Guid.NewGuid(), RobotCode = "amr-configured", SourceType = "PHYSICAL", RowVersion = new byte[8] };
        var unconfigured = new Robot { Id = Guid.NewGuid(), RobotCode = "amr-unconfigured", SourceType = "PHYSICAL", RowVersion = new byte[8] };
        var deployedMap = new MapVersion { MapKey = "area-v2", FrameId = "map_v2" };
        var latest = new MapDeploymentCheck { RobotId = configured.Id, MapVersion = deployedMap };
        var repository = new RobotRepository([configured, unconfigured], [latest]);
        var settings = new FleetSyncSettings(
            new Dictionary<string, FleetRobotMapContext> { [configured.RobotCode] = new("area-v1", "map") },
            TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(30),
            TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
        var handler = new ListPhysicalRobotsQueryHandler(repository, new EmptyTelemetryStore(), settings, TimeProvider.System);

        var result = await handler.Handle(new ListPhysicalRobotsQuery(), default);
        var configuredView = Assert.Single(result, robot => robot.RobotCode == configured.RobotCode);
        var unconfiguredView = Assert.Single(result, robot => robot.RobotCode == unconfigured.RobotCode);

        Assert.Equal("area-v1", configuredView.ConfiguredMapKey);
        Assert.Equal("map", configuredView.ConfiguredFrameId);
        Assert.Equal("area-v2", configuredView.LatestDeployedMapKey);
        Assert.Equal("map_v2", configuredView.LatestDeployedFrameId);
        Assert.Null(unconfiguredView.ConfiguredMapKey);
        Assert.Null(unconfiguredView.ConfiguredFrameId);
        Assert.Null(unconfiguredView.LatestDeployedMapKey);
        Assert.Null(unconfiguredView.LatestDeployedFrameId);
    }

    private sealed class RobotRepository(IReadOnlyList<Robot> robots, IReadOnlyList<MapDeploymentCheck> latest) : IPhysicalRobotRepository
    {
        public Task<IReadOnlyList<Robot>> ListPhysicalRobotsAsync(CancellationToken cancellationToken) => Task.FromResult(robots);
        public Task<IReadOnlyList<MapDeploymentCheck>> ListLatestDeploymentChecksAsync(CancellationToken cancellationToken) => Task.FromResult(latest);
        public Task<bool> RobotCodeExistsAsync(string robotCode, CancellationToken cancellationToken) => Task.FromResult(false);
        public void Add(Robot robot) => throw new NotSupportedException();
        public void AddAuditLog(AuditLog auditLog) => throw new NotSupportedException();
    }

    private sealed class EmptyTelemetryStore : IFleetTelemetryStore
    {
        public Task<FleetTelemetryApplyResult> ApplyAsync(FleetTelemetrySnapshot snapshot, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
        public IReadOnlyList<FleetTelemetrySnapshot> GetLatest() => [];
    }
}
