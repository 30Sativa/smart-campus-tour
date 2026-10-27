using SmartCampus.Application.Features.Routes;

namespace SmartCampus.UnitTests;

public sealed class RouteRevisionWorkflowTests
{
    private static SaveRouteRevisionCommand Valid() => new(Guid.NewGuid(), null,
        new(Guid.NewGuid(), 0, "Pilot route", null, Guid.NewGuid(), 0.5m, 0.5m, 0m,
            "LAST_POI", null, null, null, [new(Guid.NewGuid(), 30, [new("FRONT", 30)])]));

    [Fact]
    public void DraftValidator_RequiresExactMapAndOrderedPoiStopInput()
    {
        var command = Valid();
        Assert.True(new RouteRevisionDraftValidator().Validate(command).IsValid);
        Assert.False(new RouteRevisionDraftValidator().Validate(command with
        {
            Input = command.Input with { RequestId = Guid.Empty }
        }).IsValid);
        Assert.False(new RouteRevisionDraftValidator().Validate(command with
        {
            Input = command.Input with { Stops = [] }
        }).IsValid);
    }

    [Fact]
    public void DraftValidator_RejectsDuplicatePoisAndIncompleteEndPose()
    {
        var command = Valid();
        var poiRevision = command.Input.Stops[0].PoiRevisionId;
        Assert.False(new RouteRevisionDraftValidator().Validate(command with
        {
            Input = command.Input with { Stops = [new(poiRevision, 30, [new("FRONT", 30)]), new(poiRevision, 20, [new("FRONT", 20)])] }
        }).IsValid);
        Assert.False(new RouteRevisionDraftValidator().Validate(command with
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
