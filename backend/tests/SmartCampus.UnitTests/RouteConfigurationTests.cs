using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Routes.Commands.CreateRoute;
using SmartCampus.Application.Features.Routes.Commands.UpdateRoute;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class RouteConfigurationTests
{
    private static Route Sample() => new()
    {
        Id = Guid.NewGuid(), Name = "Route", MapKey = "map2-v1", MapFrame = "map", EndMode = "LAST_POI",
        RouteStops = [new RouteStop { Id = Guid.NewGuid(), PoiId = Guid.NewGuid(), StopOrder = 1,
            DwellSeconds = 30, HeadStepsJson = "[{\"preset\":\"FRONT\",\"holdSeconds\":30}]",
            Poi = new Poi { MapKey = "map2-v1", MapFrame = "map", IsActive = true } }]
    };

    [Fact]
    public void ValidStoredConfiguration_DoesNotCertifyAvailabilityOrPhysicalSafety()
    {
        var route = Sample();
        Assert.Empty(route.ConfigurationIssues());
        Assert.Empty(RouteConfiguration.AvailabilityIssues(route));
        route.RouteStops.Single().Poi.IsActive = false;
        Assert.Empty(route.ConfigurationIssues());
        Assert.Contains("POI_INACTIVE", RouteConfiguration.AvailabilityIssues(route));
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("[null]")]
    [InlineData("[{\"preset\":\"UP\",\"holdSeconds\":1}]")]
    [InlineData("[{\"preset\":\"FRONT\",\"holdSeconds\":0}]")]
    [InlineData("[{\"preset\":\"FRONT\",\"holdSeconds\":31}]")]
    public void InvalidLegacyHeadConfiguration_IsReportedWithoutCrashing(string head)
    {
        var route = Sample();
        route.RouteStops.Single().HeadStepsJson = head;
        Assert.Contains("HEAD_STEPS_INVALID", route.ConfigurationIssues());
    }

    [Fact]
    public void MapFrameEndPoseStopOrderAndDuplicates_AreValidated()
    {
        var route = Sample();
        route.RouteStops.Single().Poi.MapKey = "MAP2-V1";
        Assert.Contains("POI_MAP_MISMATCH", route.ConfigurationIssues());
        route.RouteStops.Single().Poi.MapKey = route.MapKey;
        route.RouteStops.Single().Poi.MapFrame = "odom";
        Assert.Contains("POI_MAP_MISMATCH", route.ConfigurationIssues());
        route.EndMode = "POSE";
        Assert.Contains("END_POSE_REQUIRED", route.ConfigurationIssues());
        route.EndX = 1; route.EndY = 2; route.EndYaw = 0;
        Assert.DoesNotContain("END_POSE_REQUIRED", route.ConfigurationIssues());
        route.EndMode = "LAST_POI";
        Assert.Contains("END_MODE_INVALID", route.ConfigurationIssues());
        route.RouteStops.Single().StopOrder = 2;
        Assert.Contains("STOP_ORDER_INVALID", route.ConfigurationIssues());
        route.RouteStops.Add(new RouteStop { PoiId = route.RouteStops.First().PoiId, StopOrder = 1 });
        Assert.Contains("DUPLICATE_POI", route.ConfigurationIssues());
    }

    [Fact]
    public void Revision_CoversStopsAndAvailability_ButNotMutablePoiContent()
    {
        var route = Sample();
        var version = RouteRevision.For(route);
        Assert.True(RouteRevision.IsValid(version));
        route.RouteStops.Single().Poi.Name = "Changed content";
        Assert.Equal(version, RouteRevision.For(route));
        route.RouteStops.Single().DwellSeconds++;
        Assert.NotEqual(version, RouteRevision.For(route));
        route.RouteStops.Single().DwellSeconds--;
        route.IsActive = true;
        Assert.NotEqual(version, RouteRevision.For(route));
    }

    [Fact]
    public void Validators_RejectMissingPayloadsAndNullStops()
    {
        var validator = new CreateRouteCommandValidator();
        Assert.False(validator.Validate(new CreateRouteCommand(Guid.NewGuid(), null!)).IsValid);
        var input = new RouteInput("Route", null, "map2-v1", "map", 0, 0, 0, "LAST_POI", null, null, null, [null!]);
        Assert.False(validator.Validate(new CreateRouteCommand(Guid.NewGuid(), input)).IsValid);
        Assert.False(new UpdateRouteCommandValidator().Validate(new UpdateRouteCommand(Guid.NewGuid(), Guid.NewGuid(), null!)).IsValid);
    }
}
