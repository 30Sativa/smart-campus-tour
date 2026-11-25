using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Application.Features.Tours.Commands.EndTourEarly;
using SmartCampus.Application.Features.Tours.Commands.MarkTourReady;
using SmartCampus.Application.Features.Tours.Commands.NextTourStop;
using SmartCampus.Application.Features.Tours.Commands.StartTour;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Application.Features.Tours.Queries.ListTourRobots;
using SmartCampus.Domain.Entities;
using static SmartCampus.IntegrationTests.TourHappyPathSqlTests;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0043 D13 addendum: a Tour that ends, normally or early, ends its robot hold at that moment, so the robot is free for
/// another Tour as soon as it is released. A pre-Start cancel still releases the hold (ADR-0047).
/// </summary>
public sealed class TourEndsHoldSqlTests
{
    private const string Reason = "Trình diễn với đoàn khách của nhà trường.";

    [SchemaV11Fact]
    public async Task AQuickTourRunToTheEnd_EndsItsHold_AndAnotherQuickTourTakesTheRobotAtOnce()
    {
        await using var w = await World.Create(enabled: true);
        var id = await StartQuickTour(w);
        await RunToTheEnd(w, id);

        var (tour, hold) = await TourAndHold(w, id);
        Assert.Equal("COMPLETED", tour.State);
        Assert.Equal(tour.EndedAt, hold.EndsAt);
        Assert.Null(hold.ReleasedAt);
        await AssertEndRecordsThePreviousHoldEnd(w, id, "TOUR_COMPLETED");

        // From the end onwards nothing holds the robot: the harness Tour's shift hold was this morning, the other Tour is tomorrow.
        Assert.Empty(await w.H.Service<ITourManagementRepository>().GetActiveReservationsAsync(hold.RobotId, w.Clock.Now!.Value,
            w.Clock.Now.Value.AddHours(1), CancellationToken.None));
        var option = await QuickOption(w);
        Assert.Null(option.HeldByTourName);
        Assert.False(option.NeedsInspection);
        await w.H.CreateQuickTour(Reason);
    }

    [SchemaV11Fact]
    public async Task EndEarly_WithTheRobotStopped_ReleasesIt_AndEndsTheHold()
    {
        await using var w = await World.Create(enabled: true);
        var id = await StartQuickTour(w);
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        Tick(w);
        await EndEarly(w, id);

        var (tour, hold) = await TourAndHold(w, id);
        Assert.Equal("CANCELLED", tour.State);
        Assert.Equal(tour.EndedAt, hold.EndsAt);
        await using (var db = w.H.Context())
            Assert.Null((await db.Robots.AsNoTracking().SingleAsync()).CurrentTourId);
        await AssertEndRecordsThePreviousHoldEnd(w, id, "TOUR_ENDED_EARLY");
        Assert.Null((await QuickOption(w)).HeldByTourName);
        await w.H.CreateQuickTour(Reason);
    }

    [SchemaV11Fact]
    public async Task EndEarly_WithAnOpenGoTo_KeepsTheRobotForInspection_ButStillEndsTheHold()
    {
        await using var w = await World.Create(enabled: true);
        var id = await StartQuickTour(w);
        Tick(w);
        await EndEarly(w, id);

        var (tour, hold) = await TourAndHold(w, id);
        Assert.Equal(tour.EndedAt, hold.EndsAt);
        await using (var db = w.H.Context())
        {
            var robot = await db.Robots.AsNoTracking().SingleAsync();
            Assert.True(robot.NeedsInspection);
            Assert.Equal(id, robot.CurrentTourId);
        }
        // The form says the robot waits for a check, not that a Tour still holds it.
        var option = await QuickOption(w);
        Assert.True(option.NeedsInspection);
        Assert.Null(option.HeldByTourName);
    }

    [SchemaV11Fact]
    public async Task ATourEndingTheMomentItsHoldStarts_KeepsTheHoldOneSecondLong()
    {
        await using var w = await World.Create(enabled: true);
        // The clock does not move: the hold starts, the Tour starts and ends at the same instant.
        var id = await StartQuickTour(w, tick: false);
        await EndEarly(w, id);

        var (tour, hold) = await TourAndHold(w, id);
        Assert.Equal(tour.EndedAt, hold.StartsAt);
        Assert.Equal(hold.StartsAt.AddSeconds(1), hold.EndsAt);
    }

    [SchemaV11Fact]
    public async Task AShiftTourCompleted_EndsItsHold_AndTheDetailStillShowsItWithTheNewEnd()
    {
        await using var w = await World.Create(enabled: true);
        await Start(w);
        await RunToTheEnd(w, w.H.TourId);

        var (tour, hold) = await TourAndHold(w, w.H.TourId);
        Assert.Equal(("COMPLETED", tour.EndedAt), (tour.State, (DateTimeOffset?)hold.EndsAt));
        var reservation = (await w.H.Send(new GetTourQuery(w.H.TourId))).Reservation;
        Assert.NotNull(reservation);
        Assert.Equal((TourReadySqlTests.Robot, hold.StartsAt, tour.EndedAt), (reservation.RobotCode, reservation.StartsAt, (DateTimeOffset?)reservation.EndsAt));
        // Before, the shift hold ran to its end and refused a quick Tour created now.
        await w.H.CreateQuickTour(Reason);
    }

    [SchemaV11Fact]
    public async Task ACancelBeforeStart_StillReleasesTheHold_WithoutMovingItsEnd()
    {
        await using var w = await World.Create(enabled: true);
        w.Clock.Now = w.H.Start.AddMinutes(225);
        var id = await w.H.CreateQuickTour(Reason);
        var before = (await TourAndHold(w, id)).Hold;
        Tick(w);
        await w.H.Send(new CancelTourCommand(id, w.H.StaffId, new(Guid.NewGuid(), await Version(w, id), "Đoàn khách không tới")));

        await using var db = w.H.Context();
        var hold = await db.TourRobotReservations.AsNoTracking().SingleAsync(r => r.TourId == id);
        Assert.Equal((w.Clock.Now, (Guid?)w.H.StaffId), (hold.ReleasedAt, hold.ReleasedByUserId));
        Assert.Equal(before.EndsAt, hold.EndsAt);
    }

    /// <summary>A quick Tour at noon, outside the harness Tour's shift hold, made READY and started on the harness robot.</summary>
    private static async Task<Guid> StartQuickTour(World w, bool tick = true)
    {
        w.Clock.Now = w.H.Start.AddMinutes(225);
        await w.Report();
        var id = await w.H.CreateQuickTour(Reason);
        await w.H.Send(new MarkTourReadyCommand(id, w.H.StaffId, new(Guid.NewGuid(), await Version(w, id))));
        if (tick) Tick(w);
        await w.Report();
        await w.H.Send(new StartTourCommand(id, w.H.OperatorId, new(Guid.NewGuid(), await Version(w, id), new(true, true, true, true))));
        return id;
    }

    /// <summary>The harness route has two stops and ends at the last one: arrive, Next, arrive, Next completes.</summary>
    private static async Task RunToTheEnd(World w, Guid id)
    {
        foreach (var _ in new[] { "first POI", "last POI" })
        {
            Tick(w);
            await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
            await w.Report();
            await w.H.Send(new NextTourStopCommand(id, w.H.OperatorId, new(Guid.NewGuid(), await Version(w, id))));
        }
    }

    /// <summary>Moves the clock a little, so an end is clearly after the hold's start.</summary>
    private static void Tick(World w) => w.Clock.Now = w.Clock.Now!.Value.AddSeconds(2);

    private static async Task EndEarly(World w, Guid id) =>
        await w.H.Send(new EndTourEarlyCommand(id, w.H.OperatorId, new(Guid.NewGuid(), await Version(w, id), "Mưa lớn")));

    private static async Task<string> Version(World w, Guid id) => (await w.H.Send(new GetTourQuery(id))).Tour.RowVersion;

    private static async Task<(Tour Tour, TourRobotReservation Hold)> TourAndHold(World w, Guid id)
    {
        await using var db = w.H.Context();
        return (await db.Tours.AsNoTracking().SingleAsync(t => t.Id == id),
            await db.TourRobotReservations.AsNoTracking().SingleAsync(r => r.TourId == id));
    }

    private static async Task<TourRobotOption> QuickOption(World w) =>
        Assert.Single(await w.H.Send(new ListTourRobotsQuery(w.H.Route.RevisionId, Quick: true)));

    private static async Task AssertEndRecordsThePreviousHoldEnd(World w, Guid id, string eventType)
    {
        await using var db = w.H.Context();
        var ended = await db.TourEvents.AsNoTracking().SingleAsync(e => e.TourId == id && e.EventType == eventType);
        Assert.Contains("\"holdEndsAtBefore\":", ended.DataJson);
    }
}
