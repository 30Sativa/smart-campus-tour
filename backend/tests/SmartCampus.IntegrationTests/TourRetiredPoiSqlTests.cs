using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0062 follow-up on a real database: no new Tour (regular or quick) on a route revision with a retired POI;
/// a Tour created before keeps working and says so.
/// </summary>
public sealed class TourRetiredPoiSqlTests
{
    private const string Reason = "Đoàn đến sớm hơn dự kiến.";

    [SchemaV11Fact]
    public async Task NewTours_AreRefusedWhileARoutePoiIsRetired_AndAllowedAfterReactivation()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var poi = await RoutePoi(h, "Thư viện");
        var retired = await h.Send(new RetirePoiProposalCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), poi.RowVersion)));

        var regular = await Assert.ThrowsAsync<ConflictException>(() => h.CreateTour(h.Start.AddDays(2)));
        Assert.Equal("ROUTE_HAS_RETIRED_POI", regular.Code);
        Assert.Equal("Tuyến có POI đã ngưng dùng: Thư viện. Lưu phiên bản tuyến mới không có POI này, hoặc dùng lại POI.", regular.Message);
        var quick = await Assert.ThrowsAsync<ConflictException>(() => h.CreateQuickTour(Reason));
        Assert.Equal("ROUTE_HAS_RETIRED_POI", quick.Code);
        await using (var db = h.Context())
            Assert.Equal(1, await db.Tours.CountAsync());

        // The route says so on its current revision, for the route pages and the Tour page alike.
        Assert.Equal(["Thư viện"], (await h.Send(new GetRouteRevisionQuery(h.Route.RouteId, null, false))).RetiredPoiNames);
        Assert.Equal(["Thư viện"], (await h.Detail()).RouteRevision!.RetiredPoiNames);
        // The route list, which the Tour-create form reads, says so too, so the form can disable the route.
        var listed = (await h.Send(new ListVersionedRoutesQuery(h.Route.Name, h.Route.MapVersionId, 1, 100, "name"))).Items
            .Single(item => item.RouteId == h.Route.RouteId);
        Assert.Equal(["Thư viện"], listed.RetiredPoiNames);

        await h.Send(new ReactivatePoiProposalCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), retired.RowVersion)));
        Assert.Empty((await h.Detail()).RouteRevision!.RetiredPoiNames!);
        await h.CreateTour(h.Start.AddDays(2));
        await h.CreateQuickTour(Reason);
        await using (var db = h.Context())
            Assert.Equal(3, await db.Tours.CountAsync());
    }

    [SchemaV11Fact]
    public async Task ADiscardedPoi_AlsoBlocksANewTour()
    {
        // A route stop's POI cannot normally be discarded (POI_PROPOSAL_IN_ROUTE); this stands in for older data.
        await using var h = await TourReadySqlTests.Harness.Create();
        var poi = await RoutePoi(h, "Phòng lab");
        await h.Database.ExecuteAsync($"UPDATE dbo.PoiProposals SET DiscardedAt = SYSDATETIMEOFFSET(), DiscardedByUserId = '{h.StaffId}' WHERE Id = '{poi.Id}';");
        Assert.Equal("ROUTE_HAS_RETIRED_POI", (await Assert.ThrowsAsync<ConflictException>(() => h.CreateTour(h.Start.AddDays(2)))).Code);
    }

    [SchemaV11Fact]
    public async Task ATourCreatedBefore_StillGoesReady_AndShowsTheWarning()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var poi = await RoutePoi(h, "Thư viện");
        await h.Send(new RetirePoiProposalCommand(h.StaffId, poi.Id, new(Guid.NewGuid(), poi.RowVersion)));
        await h.AddAcceptedRow();

        var detail = await h.Detail();
        Assert.Equal(["Thư viện"], detail.RouteRevision!.RetiredPoiNames);
        Assert.True(detail.Permissions.CanMarkReady);
        Assert.Empty(detail.Permissions.ReadyBlockers!);
        await h.Ready(new(Guid.NewGuid(), detail.Tour.RowVersion));
        Assert.Equal("READY", (await h.Detail()).Tour.State);
    }

    /// <summary>The POI behind the named stop of the harness route, as its current view.</summary>
    internal static async Task<PoiProposalView> RoutePoi(TourReadySqlTests.Harness h, string name)
    {
        var stop = h.Route.Stops.Single(item => item.Name == name);
        return await h.Send(new GetPoiProposalQuery(stop.PoiProposalId!.Value));
    }
}
