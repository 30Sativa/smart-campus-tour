using SmartCampus.Application.Features.Routes;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0060: approving new wording leaves a saved route revision on the text it snapshotted. The route read names the
/// newer approved version per stop so Staff can see it and save the route again.
/// </summary>
public sealed class RouteNewerNarrationSqlTests
{
    [SchemaV11Fact]
    public async Task AStopNamesTheNewerApprovedNarration_UntilTheRouteIsSavedAgain()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var route = await h.Send(new GetRouteRevisionQuery(h.Route.RouteId, null, false));
        Assert.All(route.Stops, stop => Assert.Null(stop.NewerNarrationRevisionNumber));

        var first = route.Stops.OrderBy(stop => stop.StopOrder).First();
        var approved = await NarrationSeed.ApproveAsync(h.Send, h.StaffId, h.OperatorId, first.PoiProposalId!.Value, "Lời mới.");
        route = await h.Send(new GetRouteRevisionQuery(h.Route.RouteId, null, false));
        Assert.Equal(approved.RevisionNumber, route.Stops.Single(stop => stop.Id == first.Id).NewerNarrationRevisionNumber);
        Assert.All(route.Stops.Where(stop => stop.Id != first.Id), stop => Assert.Null(stop.NewerNarrationRevisionNumber));

        var saved = await h.Send(new SaveRouteRevisionCommand(h.StaffId, route.RouteId, new(Guid.NewGuid(), route.RevisionNumber,
            route.Name, route.Description, route.MapVersionId, route.StartX, route.StartY, route.StartYaw, route.EndMode,
            route.EndX, route.EndY, route.EndYaw, route.Stops.OrderBy(stop => stop.StopOrder)
                .Select(stop => new RouteRevisionStopInput(stop.PoiRevisionId, stop.DwellSeconds, stop.HeadSteps)).ToArray())));
        var reread = await h.Send(new GetRouteRevisionQuery(saved.RouteId, null, false));
        Assert.Equal("Lời mới.", reread.Stops.OrderBy(stop => stop.StopOrder).First().NarrationText);
        Assert.All(reread.Stops, stop => Assert.Null(stop.NewerNarrationRevisionNumber));
    }
}
