using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.AuditLogs;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// WF-A polish on a real database: the "Ngưng dùng POI" dialog names the Tours that stop at the POI, and the system
/// log names a route test run by its route, not by the robot that ran it.
/// </summary>
public sealed class PoiScheduledToursAndAuditSqlTests
{
    [SchemaV11Fact]
    public async Task PoiScheduledTours_ListsTheToursWhoseRouteStopsAtIt_SoonestFirst()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var poi = await TourRetiredPoiSqlTests.RoutePoi(h, "Thư viện");
        var later = await h.CreateTour(h.Start.AddDays(3));

        var tours = await h.Send(new ListPoiScheduledToursQuery(poi.Id));
        Assert.Equal([h.TourId, later], tours.Select(tour => tour.Id));
        Assert.All(tours, tour => Assert.Equal("SCHEDULED", tour.State));
        Assert.Equal("Tour READY", tours[0].Name);
        Assert.Equal(h.Start, tours[0].ScheduledStartAt);

        // Retiring changes none of them, and the list stays the same afterwards.
        await h.Send(new RetirePoiProposalCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), poi.RowVersion)));
        Assert.Equal([h.TourId, later], (await h.Send(new ListPoiScheduledToursQuery(poi.Id))).Select(tour => tour.Id));

        await Assert.ThrowsAsync<NotFoundException>(() => h.Send(new ListPoiScheduledToursQuery(Guid.NewGuid())));
    }

    [SchemaV11Fact]
    public async Task RouteTestRunAuditRow_NamesTheRouteAndTheRevisionSaveTime()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var page = await h.Send(new ListAuditLogsQuery(new("ROUTE_TEST_PASSED", null, null, null, 1, 20)));

        var row = Assert.Single(page.Items);
        Assert.Equal("RouteRevision", row.EntityType);
        Assert.Equal("Tuyến READY", row.RouteName);
        await using (var db = h.Context())
            Assert.Equal((await db.RouteRevisions.AsNoTracking().SingleAsync(revision => revision.Id == h.Route.RevisionId)).CreatedAt, row.RouteRevisionSavedAt);
        // The robot is still there for anyone who reads it, but it no longer stands in for the route.
        Assert.Equal(TourReadySqlTests.Robot, row.RobotCode);

        // Rows on other entities are untouched.
        var tourRow = (await h.Send(new ListAuditLogsQuery(new("TOUR_CREATED", null, null, null, 1, 20)))).Items.First();
        Assert.Null(tourRow.RouteName);
        Assert.Null(tourRow.RouteRevisionSavedAt);
    }
}
