using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Features.RobotDiagnostics.Queries.GetTechnicalDashboard;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0066 consequence: the Technical dashboard names upcoming Tours the shared robot rule would refuse at READY and Start.
/// World as in RobotMapReadinessSqlTests: First holds Pilot v1, reports on it and passed its check there.
/// </summary>
public sealed partial class RobotIntegritySqlTests
{
    [SchemaV11Fact]
    public async Task Dashboard_UpcomingToursOnAMapTheRobotNoLongerHolds_AreOneWarningForThatRobot()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        var soon = await h.CreateTour(tested, First, daysAhead: 4, name: "Tham quan lầu 6");
        await h.CreateTour(tested, First, daysAhead: 5, name: "Tham quan chiều");

        // Robot ready on the Tours' map: nothing to report.
        Assert.DoesNotContain((await Dashboard(h)).ActionItems, item => item.Type == "TOUR_ROBOT_NOT_READY");

        await h.Assign(First, h.OtherMap.Id);

        var robot = await h.Robot(First);
        var item = Assert.Single((await Dashboard(h)).ActionItems, item => item.Type == "TOUR_ROBOT_NOT_READY");
        Assert.Equal(("WARNING", $"2 Tour sắp tới của robot {First} chưa chạy được", robot.Id.ToString(), $"/technical/robots?robot={robot.Id}"),
            (item.Severity, item.Title, item.TargetId, item.LinkUrl));
        Assert.Equal($"Robot {First} đang gán Other · other · phiên bản 1, không phải bản đồ này. " +
            $"Sớm nhất: Tour Tham quan lầu 6 {await LocalStart(h, soon)}.", item.Description);
    }

    [SchemaV11Fact]
    public async Task Dashboard_OneBlockedTour_IsNamedWithItsTime_AndCancelledOrLaterToursAreLeftOut()
    {
        await using var h = await Harness.Create();
        var tested = await h.TestedRoute();
        var later = await h.CreateTour(tested, First, daysAhead: 10, name: "Tour tuần sau");
        var cancelled = await h.CreateTour(tested, First, daysAhead: 5, name: "Tour đã huỷ");
        var soon = await h.CreateTour(tested, First, daysAhead: 4, name: "Tham quan lầu 6");
        await Cancel(h, cancelled);
        await h.Assign(First, h.OtherMap.Id);

        var item = Assert.Single((await Dashboard(h)).ActionItems, item => item.Type == "TOUR_ROBOT_NOT_READY");

        Assert.Equal($"Tour Tham quan lầu 6 {await LocalStart(h, soon)} chưa chạy được", item.Title);
        Assert.Equal($"Robot {First} đang gán Other · other · phiên bản 1, không phải bản đồ này.", item.Description);
        await Cancel(h, soon);
        Assert.DoesNotContain((await Dashboard(h)).ActionItems, entry => entry.Type == "TOUR_ROBOT_NOT_READY");
        await using var db = h.Context();
        Assert.Equal("SCHEDULED", (await db.Tours.AsNoTracking().SingleAsync(tour => tour.Id == later)).State);
    }

    private static Task<TechnicalDashboardDto> Dashboard(Harness h) => h.Send(new GetTechnicalDashboardQuery());

    private static async Task<string> LocalStart(Harness h, Guid tourId)
    {
        await using var db = h.Context();
        var start = await db.Tours.AsNoTracking().Where(tour => tour.Id == tourId).Select(tour => tour.ScheduledStartAt).SingleAsync();
        return start.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM HH:mm", CultureInfo.InvariantCulture);
    }

    private static async Task Cancel(Harness h, Guid tourId)
    {
        byte[] version;
        await using (var db = h.Context())
            version = await db.Tours.AsNoTracking().Where(tour => tour.Id == tourId).Select(tour => tour.RowVersion).SingleAsync();
        await h.Send(new CancelTourCommand(tourId, h.StaffId, new(Guid.NewGuid(), Convert.ToBase64String(version), "Đổi lịch")));
    }
}
