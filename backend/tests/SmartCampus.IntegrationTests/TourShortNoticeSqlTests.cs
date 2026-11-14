using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Commands.SubmitRegistration;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;
using SmartCampus.Application.Features.Representative.Queries.Lists;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateScheduleBlock;
using SmartCampus.Application.Features.Tours.Commands.ExpirePendingDecisions;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Application.Features.Tours.Queries.GetTourShifts;
using SmartCampus.Application.Features.Tours.Queries.GetTourStartChecks;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0053: a quick Tour has no date or shift. It holds its robot from creation, is published at its latest Start
/// (creation plus the configured wait), opens Start at creation and keeps the short-notice registration rules of ADR-0050.
/// The harness Tour holds the robot for S1 (08:00-10:00) of its day.
/// </summary>
public sealed class TourShortNoticeSqlTests
{
    private const string Reason = "Trình diễn với đoàn khách của nhà trường.";

    [SchemaV11Fact]
    public async Task QuickTours_WaitTheDefault30Minutes_WhenNotConfigured()
    {
        await using var w = await World.Create(minutes: null);
        w.Clock.Now = w.Noon;
        var day = TourSchedule.CampusDate(w.Noon);
        Assert.Equal(30, (await w.H.Send(new GetTourShiftsQuery(day, day))).QuickTourWaitMinutes);
        var id = await w.H.CreateQuickTour(Reason);
        Assert.Equal(w.Noon.AddMinutes(30), (await w.H.Send(new GetTourQuery(id))).Tour.ScheduledStartAt);
    }

    [SchemaV11Fact]
    public async Task AQuickTour_HoldsTheRobotFromCreation_AndIsPublishedAtItsLatestStart()
    {
        // Noon is outside every shift: a quick Tour needs none.
        await using var w = await World.Create(minutes: 60);
        w.Clock.Now = w.Noon;
        var deadline = w.Noon.AddMinutes(60);
        var day = TourSchedule.CampusDate(w.Noon);
        Assert.Equal(60, (await w.H.Send(new GetTourShiftsQuery(day, day))).QuickTourWaitMinutes);

        var requestId = Guid.NewGuid();
        var id = await w.H.CreateQuickTour(Reason, requestId);
        Assert.Equal(id, await w.H.CreateQuickTour(Reason, requestId));

        var details = await w.H.Send(new GetTourQuery(id));
        Assert.True(details.Tour.IsShortNotice);
        Assert.Equal(("SCHEDULED", deadline, deadline), (details.Tour.State, details.Tour.ScheduledStartAt, details.Tour.RegistrationClosesAt!.Value));
        // Being a quick Tour is a preparation decision, so the Tour is not treated as if it had run.
        Assert.False(details.Usage.HasOperationalHistory);

        await using var db = w.H.Context();
        var hold = await db.TourRobotReservations.AsNoTracking().SingleAsync(r => r.TourId == id);
        Assert.Equal(w.Noon, hold.StartsAt);
        Assert.Equal(deadline + TimeSpan.FromSeconds(hold.ExpectedDurationSeconds!.Value) + TourSchedule.ReservationBuffer, hold.EndsAt);
        var recorded = await db.TourEvents.AsNoTracking().SingleAsync(e => e.TourId == id);
        Assert.Equal((TourLifecycleEvents.CreatedShortNotice, Reason), (recorded.EventType, recorded.ReasonNote));

        // The robot is now held, so a second quick Tour waits for this one.
        Assert.Equal("ROBOT_RESERVATION_CONFLICT", (await Assert.ThrowsAsync<ConflictException>(() => w.H.CreateQuickTour(Reason))).Code);
    }

    [SchemaV11Fact]
    public async Task AQuickTour_CannotTakeTheRobotFromATourOnAShift()
    {
        await using var w = await World.Create(minutes: 60);
        // 07:15 plus an hour of waiting runs into the harness Tour's 08:00 hold.
        w.Clock.Now = w.H.Start.AddMinutes(-60);
        Assert.Equal("ROBOT_RESERVATION_CONFLICT", (await Assert.ThrowsAsync<ConflictException>(() => w.H.CreateQuickTour(Reason))).Code);
    }

    [SchemaV11Fact]
    public async Task AQuickTour_RespectsAnAdminBlock_OverItsHold()
    {
        await using var w = await World.Create(minutes: 60);
        var day = TourSchedule.CampusDate(w.H.Start);
        await w.H.Send(new CreateScheduleBlockCommand(w.H.StaffId, new(Guid.NewGuid(), day, "S2", "Bảo trì")));

        // 12:30 plus an hour reaches S2 (13:00), which is closed; 11:00 ends before it.
        w.Clock.Now = w.Noon.AddMinutes(30);
        Assert.Equal("SHIFT_BLOCKED", (await Assert.ThrowsAsync<ConflictException>(() => w.H.CreateQuickTour(Reason))).Code);
        w.Clock.Now = w.Noon.AddMinutes(-60);
        await w.H.CreateQuickTour(Reason);
    }

    [SchemaV11Fact]
    public async Task AQuickTour_OpensStartAtCreation_AndAStandardTourKeepsItsEarlyLimit()
    {
        await using var w = await World.Create(minutes: 60);
        w.Clock.Now = w.Noon;
        var id = await w.H.CreateQuickTour(Reason);

        var checks = await w.H.Send(new GetTourStartChecksQuery(id, w.H.OperatorId));
        Assert.Equal(w.Noon, checks.OpensAt);
        Assert.True(checks.Checks.Single(check => check.Id == "withinStartWindow").Passed);
        // No accepted row, so nobody can be left behind.
        Assert.True(checks.Checks.Single(check => check.Id == TourStartPreflight.AllViewersJoinedCheck).Passed);
        // ADR-0054 addendum: a quick Tour runs for a group already on site, so it needs no accepted row.
        Assert.True(checks.Checks.Single(check => check.Id == TourStartPreflight.HasAcceptedRowsCheck).Passed);
        Assert.DoesNotContain(TourStartPreflight.HasAcceptedRowsCheck, checks.BlockedBy);
        // Every other Start check still decides.
        foreach (var expected in new[] { "tourReady", "robotDispatchEnabled", "telemetryFresh", "commandTransportEnabled" })
            Assert.Contains(expected, checks.BlockedBy);

        Assert.Equal(w.H.Start.AddMinutes(-10), (await w.H.Send(new GetTourStartChecksQuery(w.H.TourId, w.H.OperatorId))).OpensAt);
    }

    [SchemaV11Fact]
    public async Task Registration_StaysOpenUntilTheLatestStart_AndNothingExpires_ButUndecidedRowsBlockReady()
    {
        await using var w = await World.Create(minutes: 60);
        w.Clock.Now = w.Noon;
        var id = await w.H.CreateQuickTour(Reason);
        var deadline = w.Noon.AddMinutes(60);

        w.Clock.Now = w.Noon.AddMinutes(30);
        var first = await w.Representative("first");
        var listed = await w.H.Send(new GetRepresentativeToursQuery(first, new RepresentativeListRequest()));
        Assert.Contains(listed.Items, tour => tour.Id == id && tour.Register.Allowed && tour.RegistrationClosesAt == deadline);
        await w.Submit(id, first, "first@example.test");

        Assert.Empty(await w.H.Send(new ListToursWithExpirableDecisionsQuery()));
        Assert.Equal(0, await w.H.Send(new ExpirePendingDecisionsCommand(id)));
        Assert.Contains((await w.H.Send(new GetTourQuery(id))).Permissions.ReadyBlockers!, blocker => blocker.Code == "PENDING_DECISIONS");

        w.Clock.Now = deadline;
        var late = await w.Representative("late");
        Assert.Equal("REGISTRATION_CUTOFF", (await Assert.ThrowsAsync<ConflictException>(() => w.Submit(id, late, "late@example.test"))).Code);
    }

    [SchemaV11Fact]
    public async Task AStandardTour_KeepsItsDeadlines()
    {
        await using var w = await World.Create(minutes: 60);
        w.Clock.Now = w.H.Start.AddHours(-47);
        var representative = await w.Representative("standard");
        Assert.Equal("REGISTRATION_CUTOFF", (await Assert.ThrowsAsync<ConflictException>(() => w.Submit(w.H.TourId, representative, "standard@example.test"))).Code);
        Assert.Equal(w.H.Start.AddHours(-48), (await w.H.Send(new GetTourQuery(w.H.TourId))).Tour.RegistrationClosesAt);
    }

    private sealed class World(TourReadySqlTests.Harness harness, TourStartPreflightSqlTests.MutableClock clock) : IAsyncDisposable
    {
        private static readonly TourShiftOption[] Shifts =
        [
            new() { Code = "S1", Name = "Ca sáng", Start = "08:00", End = "10:00" },
            new() { Code = "S2", Name = "Ca chiều 1", Start = "13:00", End = "15:00" }
        ];

        public TourReadySqlTests.Harness H => harness;
        public TourStartPreflightSqlTests.MutableClock Clock => clock;
        /// <summary>12:00 on the harness Tour's day, a whole minute outside every shift.</summary>
        public DateTimeOffset Noon => harness.Start.AddMinutes(225);

        public static async Task<World> Create(int? minutes)
        {
            var clock = new TourStartPreflightSqlTests.MutableClock();
            return new(await TourReadySqlTests.Harness.Create(services =>
            {
                services.AddSingleton<TimeProvider>(clock);
                services.AddSingleton(new TourScheduleSettings(Shifts, 60, shortNoticeMinLeadMinutes: minutes));
            }), clock);
        }

        public async Task<Guid> Representative(string name) =>
            (await H.Database.InsertUserAsync(true, username: $"rep.{name}", roles: ["SCHOOL_REPRESENTATIVE"])).Id;

        public async Task Submit(Guid tour, Guid representative, string email)
        {
            var version = (await H.Send(new GetTourQuery(tour))).Tour.RowVersion;
            await H.Send(new SubmitRegistrationCommand(tour, representative, Guid.NewGuid(),
                new RegistrationInput("THPT Thử", "Nhóm", "Liên hệ", "contact@example.test", version, [new RosterInput(1, "INDIVIDUAL", "Học sinh", email, null)])));
        }

        public ValueTask DisposeAsync() => H.DisposeAsync();
    }
}
