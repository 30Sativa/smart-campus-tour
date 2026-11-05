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
        var area = new MapArea { AreaKey = "area", DisplayName = "Area" };
        var assignedVersion = new MapVersion { Id = Guid.NewGuid(), AreaKey = "area", AreaKeyNavigation = area, VersionNumber = 3, MapKey = "area-v3", FrameId = "map_v3" };
        var assignedBy = new User { Id = Guid.NewGuid(), FullName = "Technical" };
        var configured = new Robot { Id = Guid.NewGuid(), RobotCode = "amr-configured", SourceType = "PHYSICAL", RowVersion = new byte[8], AssignedMapVersionId = assignedVersion.Id, AssignedMapVersion = assignedVersion, MapAssignedAt = DateTimeOffset.UtcNow, MapAssignedByUser = assignedBy };
        var unconfigured = new Robot { Id = Guid.NewGuid(), RobotCode = "amr-unconfigured", SourceType = "PHYSICAL", RowVersion = new byte[8] };
        var failed = new Robot { Id = Guid.NewGuid(), RobotCode = "amr-failed", SourceType = "PHYSICAL", RowVersion = new byte[8] };
        var deployedMap = new MapVersion { MapKey = "area-v2", FrameId = "map_v2" };
        var latest = new MapDeploymentCheck { RobotId = configured.Id, MapVersion = deployedMap, LocalizationPassed = true, DisplayPassed = true };
        var failedLatest = new MapDeploymentCheck { RobotId = failed.Id, MapVersion = deployedMap, LocalizationPassed = false, DisplayPassed = true };
        var repository = new RobotRepository([configured, unconfigured, failed], [latest, failedLatest]);
        var settings = new FleetSyncSettings(TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(30),
            TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
        var handler = new ListPhysicalRobotsQueryHandler(repository, new EmptyTelemetryStore(), settings, TimeProvider.System);

        var result = await handler.Handle(new ListPhysicalRobotsQuery(), default);
        var configuredView = Assert.Single(result, robot => robot.RobotCode == configured.RobotCode);
        var unconfiguredView = Assert.Single(result, robot => robot.RobotCode == unconfigured.RobotCode);
        var failedView = Assert.Single(result, robot => robot.RobotCode == failed.RobotCode);

        Assert.Equal(assignedVersion.Id, configuredView.AssignedMapVersionId);
        Assert.Equal("Area", configuredView.AssignedAreaName);
        Assert.Equal(3, configuredView.AssignedVersionNumber);
        Assert.Equal("area-v3", configuredView.AssignedMapKey);
        Assert.Equal("map_v3", configuredView.AssignedFrameId);
        Assert.Equal("Technical", configuredView.MapAssignedByName);
        Assert.NotNull(configuredView.MapAssignedAt);
        Assert.Equal("area-v2", configuredView.LatestDeployedMapKey);
        Assert.Equal("map_v2", configuredView.LatestDeployedFrameId);
        Assert.True(configuredView.LatestDeploymentPassed);
        Assert.Null(unconfiguredView.AssignedMapVersionId);
        Assert.Null(unconfiguredView.AssignedMapKey);
        Assert.Null(unconfiguredView.AssignedFrameId);
        Assert.Null(unconfiguredView.LatestDeployedMapKey);
        Assert.Null(unconfiguredView.LatestDeployedFrameId);
        Assert.Null(unconfiguredView.LatestDeploymentPassed);
        Assert.Equal("area-v2", failedView.LatestDeployedMapKey);
        Assert.Equal("map_v2", failedView.LatestDeployedFrameId);
        Assert.False(failedView.LatestDeploymentPassed);
    }

    [Fact]
    public async Task List_query_returns_inspection_flag_and_holding_tour_so_release_can_be_offered()
    {
        var tour = new Tour { Id = Guid.NewGuid(), State = "CANCELLED" };
        var held = new Robot { Id = Guid.NewGuid(), RobotCode = "amr-held", SourceType = "PHYSICAL", RowVersion = new byte[8],
            NeedsInspection = true, CurrentTourId = tour.Id, CurrentTour = tour };
        var free = new Robot { Id = Guid.NewGuid(), RobotCode = "amr-free", SourceType = "PHYSICAL", RowVersion = new byte[8] };
        var settings = new FleetSyncSettings(TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(30),
            TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
        var handler = new ListPhysicalRobotsQueryHandler(new RobotRepository([held, free], []), new EmptyTelemetryStore(),
            settings, TimeProvider.System);

        var result = await handler.Handle(new ListPhysicalRobotsQuery(), default);
        var heldView = Assert.Single(result, robot => robot.RobotCode == held.RobotCode);
        var freeView = Assert.Single(result, robot => robot.RobotCode == free.RobotCode);

        Assert.True(heldView.NeedsInspection);
        Assert.Equal(tour.Id, heldView.CurrentTourId);
        Assert.Equal("CANCELLED", heldView.CurrentTourState);
        Assert.False(freeView.NeedsInspection);
        Assert.Null(freeView.CurrentTourId);
        Assert.Null(freeView.CurrentTourState);
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
