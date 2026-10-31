using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Queries.GetTours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class RouteAvailabilityTests
{
    [Theory]
    [InlineData("VERSIONED", true, false, true)]
    [InlineData("VERSIONED", false, false, true)] // Stored inactive before ADR-0037; nobody turned it off.
    [InlineData("VERSIONED", false, true, false)]
    [InlineData("VERSIONED", true, true, true)]
    [InlineData("LEGACY", false, false, false)]
    [InlineData("LEGACY", true, false, true)]
    public void OpenForNewTours_FollowsTheFlagOnceSomeoneHasSetIt(string mode, bool isActive, bool touched, bool expected)
    {
        var route = new Route { AuthoringMode = mode, IsActive = isActive, UpdatedAt = touched ? DateTimeOffset.UtcNow : null };
        Assert.Equal(expected, route.IsOpenForNewTours);
    }

    [Fact]
    public void AvailabilityValidator_RequiresRequestIdAndOpaqueToken()
    {
        var validator = new SetVersionedRouteAvailabilityValidator();
        var token = new string('a', 64);
        Assert.True(validator.Validate(new SetVersionedRouteAvailabilityCommand(Guid.NewGuid(), Guid.NewGuid(), false, new(Guid.NewGuid(), token))).IsValid);
        Assert.False(validator.Validate(new SetVersionedRouteAvailabilityCommand(Guid.NewGuid(), Guid.NewGuid(), false, new(Guid.Empty, token))).IsValid);
        Assert.False(validator.Validate(new SetVersionedRouteAvailabilityCommand(Guid.NewGuid(), Guid.NewGuid(), false, new(Guid.NewGuid(), "AAAAAAAAAAA="))).IsValid);
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData(TourPhases.Upcoming, true)]
    [InlineData(TourPhases.Running, true)]
    [InlineData(TourPhases.Finished, true)]
    [InlineData("ARCHIVED", false)]
    public void TourListPhase_IsAClosedSet(string? phase, bool valid)
    {
        var request = new TourListRequest(null, "scheduledStartAt", 1, 20, null, null, null, phase);
        Assert.Equal(valid, new GetToursQueryValidator().Validate(new GetToursQuery(request)).IsValid);
    }
}
