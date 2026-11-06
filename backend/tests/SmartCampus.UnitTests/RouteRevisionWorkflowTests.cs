using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Common.Authentication;

namespace SmartCampus.UnitTests;

public sealed class RouteRevisionWorkflowTests
{
    [Fact]
    public void Participating_role_resolution_accepts_only_a_single_supported_staff_role()
    {
        Assert.True(ApplicationRoles.TryResolve(["STAFF"], out var staffRole));
        Assert.Equal(ApplicationRoles.Staff, staffRole);
        Assert.False(ApplicationRoles.TryResolve([], out _));
        Assert.False(ApplicationRoles.TryResolve(["VISITOR"], out _));
        Assert.False(ApplicationRoles.TryResolve(["STAFF", "SCHOOL_REPRESENTATIVE"], out _));
    }

    private static readonly RouteRuleSettings Rules = new(null, null);

    private static SaveRouteRevisionCommand Valid() => new(Guid.NewGuid(), null,
        new(Guid.NewGuid(), 0, "Pilot route", null, Guid.NewGuid(), 0.5m, 0.5m, 0m,
            "LAST_POI", null, null, null, [new(Guid.NewGuid(), 30, [new("FRONT", 30)]), new(Guid.NewGuid(), 30, [new("FRONT", 30)])]));

    private static SaveRouteRevisionCommand WithDwell(int seconds)
    {
        var command = Valid();
        return command with { Input = command.Input with { Stops = command.Input.Stops.Select(s => s with { DwellSeconds = seconds, HeadSteps = [new("FRONT", Math.Max(1, Math.Min(seconds, 15)))] }).ToArray() } };
    }

    [Fact]
    public void DraftValidator_RequiresAtLeastTheConfiguredNumberOfStops()
    {
        var command = Valid();
        var oneStop = command with { Input = command.Input with { Stops = [command.Input.Stops[0]] } };
        Assert.False(new RouteRevisionDraftValidator(Rules).Validate(oneStop).IsValid);
        Assert.True(new RouteRevisionDraftValidator(new RouteRuleSettings(1, null)).Validate(oneStop).IsValid);
        Assert.True(new RouteRevisionDraftValidator(Rules).Validate(command).IsValid);
    }

    [Theory]
    [InlineData(14, false)]
    [InlineData(15, true)]
    [InlineData(300, true)]
    [InlineData(301, false)]
    public void DraftValidator_KeepsEachDwellBetween15And300Seconds(int seconds, bool valid) =>
        Assert.Equal(valid, new RouteRevisionDraftValidator(Rules).Validate(WithDwell(seconds)).IsValid);

    [Theory]
    [InlineData(0, 1.0)]
    [InlineData(101, 1.0)]
    [InlineData(2, 0.0)]
    [InlineData(2, -1.0)]
    public void RouteRuleSettings_RefuseToStartWithInvalidValues(int minStops, double separation) =>
        Assert.Throws<InvalidOperationException>(() => new RouteRuleSettings(minStops, (decimal)separation));

    [Fact]
    public void RouteRuleSettings_DefaultToTwoStopsOneMetreApart()
    {
        Assert.Equal(2, Rules.MinStops);
        Assert.Equal(1.0m, Rules.MinStopSeparationMeters);
    }

    [Fact]
    public void DraftValidator_RequiresExactMapAndOrderedPoiStopInput()
    {
        var command = Valid();
        Assert.True(new RouteRevisionDraftValidator(Rules).Validate(command).IsValid);
        Assert.False(new RouteRevisionDraftValidator(Rules).Validate(command with
        {
            Input = command.Input with { RequestId = Guid.Empty }
        }).IsValid);
        Assert.False(new RouteRevisionDraftValidator(Rules).Validate(command with
        {
            Input = command.Input with { Stops = [] }
        }).IsValid);
    }

    [Fact]
    public void DraftValidator_RejectsDuplicatePoisAndIncompleteEndPose()
    {
        var command = Valid();
        var poiRevision = command.Input.Stops[0].PoiRevisionId;
        Assert.False(new RouteRevisionDraftValidator(Rules).Validate(command with
        {
            Input = command.Input with { Stops = [new(poiRevision, 30, [new("FRONT", 30)]), new(poiRevision, 20, [new("FRONT", 20)])] }
        }).IsValid);
        Assert.False(new RouteRevisionDraftValidator(Rules).Validate(command with
        {
            Input = command.Input with { EndMode = "POSE", EndX = 1m, EndY = null, EndYaw = 0m }
        }).IsValid);
    }

    [Fact]
    public void RouteTestPassRequiresWholeRouteObservationsAndMeasuredTime()
    {
        var request = new RouteRunRequest(Guid.NewGuid(), "physical", Guid.NewGuid(), "PASS",
            false, true, true, 60, null, "manual evidence");
        var command = new RecordRouteTestRunCommand(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), request);
        Assert.False(new RecordRouteTestRunValidator().Validate(command).IsValid);
        Assert.True(new RecordRouteTestRunValidator().Validate(command with
        {
            Request = request with { AllStopsReached = true }
        }).IsValid);
    }

    [Fact]
    public void FailRequiresExplicitReasonAndAFailedObservation()
    {
        var request = new RouteRunRequest(Guid.NewGuid(), "physical", Guid.NewGuid(), "FAIL",
            true, true, true, 60, null, "manual evidence");
        var command = new RecordRouteTestRunCommand(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), request);
        Assert.False(new RecordRouteTestRunValidator().Validate(command).IsValid);
        Assert.True(new RecordRouteTestRunValidator().Validate(command with
        {
            Request = request with { FailureReason = "Localization drift", LocalizationPassed = false }
        }).IsValid);
    }

}
