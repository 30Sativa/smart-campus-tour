using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Commands.SubmitRegistration;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;
using SmartCampus.Application.Features.Representative.Queries.Lists;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.ExpirePendingDecisions;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Application.Features.Tours.Queries.GetTourStartChecks;

namespace SmartCampus.IntegrationTests;

/// <summary>ADR-0050: a short-notice Tour changes the lead time and the registration deadlines, and nothing about Start.</summary>
public sealed class TourShortNoticeSqlTests
{
    private const string Reason = "Trình diễn với đoàn khách của nhà trường.";

    [SchemaV11Fact]
    public async Task ATourNeedsTheOption_AndTheMinimumNotice_AndIsRecordedWithItsReason()
    {
        await using var w = await World.Create(minutes: 60);
        w.Clock.Now = w.Afternoon.AddMinutes(-60);
        Assert.Equal("TOUR_LEAD_TIME_TOO_SHORT", (await Assert.ThrowsAsync<ConflictException>(() => w.H.CreateTour(w.Afternoon))).Code);
        w.Clock.Now = w.Afternoon.AddMinutes(-59);
        Assert.Equal("TOUR_LEAD_TIME_TOO_SHORT", (await Assert.ThrowsAsync<ConflictException>(() => w.H.CreateTour(w.Afternoon, Reason))).Code);

        w.Clock.Now = w.Afternoon.AddMinutes(-60);
        var id = await w.H.CreateTour(w.Afternoon, Reason);

        var details = await w.H.Send(new GetTourQuery(id));
        Assert.True(details.Tour.IsShortNotice);
        Assert.Equal(w.Afternoon, details.Tour.RegistrationClosesAt);
        // Being short notice is a preparation decision, so the Tour is not treated as if it had run.
        Assert.False(details.Usage.HasOperationalHistory);
        await using var db = w.H.Context();
        var recorded = await db.TourEvents.AsNoTracking().SingleAsync(e => e.TourId == id);
        Assert.Equal((TourLifecycleEvents.CreatedShortNotice, Reason), (recorded.EventType, recorded.ReasonNote));
    }

    [SchemaV11Fact]
    public async Task TheOptionIsOff_UntilConfigured()
    {
        await using var w = await World.Create(minutes: null);
        w.Clock.Now = w.Afternoon.AddHours(-2);
        Assert.Equal("SHORT_NOTICE_DISABLED", (await Assert.ThrowsAsync<ConflictException>(() => w.H.CreateTour(w.Afternoon, Reason))).Code);
    }

    [SchemaV11Fact]
    public async Task Registration_StaysOpenUntilTheStart_AndNothingExpires_ButUndecidedRowsBlockReady()
    {
        await using var w = await World.Create(minutes: 60);
        w.Clock.Now = w.Afternoon.AddHours(-3);
        var id = await w.H.CreateTour(w.Afternoon, Reason);

        // Well inside the 48-hour and 24-hour marks of a standard Tour.
        w.Clock.Now = w.Afternoon.AddMinutes(-30);
        var first = await w.Representative("first");
        var listed = await w.H.Send(new GetRepresentativeToursQuery(first, new RepresentativeListRequest()));
        Assert.Contains(listed.Items, tour => tour.Id == id && tour.Register.Allowed && tour.RegistrationClosesAt == w.Afternoon);
        await w.Submit(id, first, "first@example.test");

        Assert.Empty(await w.H.Send(new ListToursWithExpirableDecisionsQuery()));
        Assert.Equal(0, await w.H.Send(new ExpirePendingDecisionsCommand(id)));
        Assert.Contains((await w.H.Send(new GetTourQuery(id))).Permissions.ReadyBlockers!, blocker => blocker.Code == "PENDING_DECISIONS");

        w.Clock.Now = w.Afternoon;
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

    [SchemaV11Fact]
    public async Task Start_ChecksAShortNoticeTourLikeAnyOther()
    {
        await using var w = await World.Create(minutes: 60);
        w.Clock.Now = w.Afternoon.AddHours(-2);
        var id = await w.H.CreateTour(w.Afternoon, Reason);
        w.Clock.Now = w.Afternoon;
        var checks = await w.H.Send(new GetTourStartChecksQuery(id, w.H.OperatorId));
        Assert.False(checks.CanStart);
        foreach (var expected in new[] { "tourReady", "robotDispatchEnabled", "telemetryFresh", "commandTransportEnabled" })
            Assert.Contains(expected, checks.BlockedBy);
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
        /// <summary>The start of the second shift of the day that the harness's own Tour uses, which is free.</summary>
        public DateTimeOffset Afternoon => harness.Start.AddHours(5);

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
