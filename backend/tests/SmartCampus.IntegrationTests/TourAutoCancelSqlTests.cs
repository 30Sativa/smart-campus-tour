using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.AutoCancelOverdueTour;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Application.Features.Tours.Commands.StartTour;

namespace SmartCampus.IntegrationTests;

/// <summary>ADR-0047: the system cancels a SCHEDULED/READY Tour whose robot hold ended without a Start.</summary>
public sealed class TourAutoCancelSqlTests
{
    [SchemaV11Fact]
    public async Task AtTheEndOfTheHold_TheTourIsCancelledBySystem_OneMinuteEarlierItIsNot()
    {
        await using var w = await World.Create();
        var endsAt = await w.HoldEndsAt();

        w.Clock.Now = endsAt.AddMinutes(-1);
        Assert.Empty(await w.Due());
        Assert.Equal(AutoCancelOutcome.Skipped, await w.AutoCancel());
        Assert.Equal("SCHEDULED", await w.State());

        w.Clock.Now = endsAt;
        Assert.Equal([w.H.TourId], await w.Due());
        Assert.Equal(AutoCancelOutcome.Cancelled, await w.AutoCancel());

        await using var db = w.H.Context();
        var tour = await db.Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId);
        Assert.Equal("CANCELLED", tour.State);
        Assert.Equal(TourAutoCancel.Reason, tour.EndReason);
        Assert.Equal(endsAt, tour.EndedAt);
        var reservation = await db.TourRobotReservations.AsNoTracking().SingleAsync(r => r.TourId == w.H.TourId);
        Assert.Equal(endsAt, reservation.ReleasedAt);
        Assert.Null(reservation.ReleasedByUserId);
        var receipt = await db.AuditLogs.AsNoTracking().SingleAsync(a => a.TourId == w.H.TourId && a.Action == "TOUR_CANCELLED");
        Assert.Null(receipt.ActorUserId);
        Assert.Equal(TourAutoCancel.ResultCode, receipt.ResultCode);
        Assert.Contains("\"source\":\"SYSTEM\"", receipt.DataJson);
    }

    [SchemaV11Fact]
    public async Task WithoutAReservation_TheHoldEndsWhenTheStartWindowCloses()
    {
        await using var w = await World.Create();
        await w.H.Database.ExecuteAsync($"UPDATE dbo.TourRobotReservations SET ReleasedAt = SYSDATETIMEOFFSET(), ReleasedByUserId = '{w.H.StaffId}';");
        var lastStart = w.H.Start.AddMinutes(15);

        w.Clock.Now = lastStart.AddMinutes(-1);
        Assert.Empty(await w.Due());
        Assert.Equal(AutoCancelOutcome.Skipped, await w.AutoCancel());
        w.Clock.Now = lastStart;
        Assert.Equal([w.H.TourId], await w.Due());
        Assert.Equal(AutoCancelOutcome.Cancelled, await w.AutoCancel());
        Assert.Equal("CANCELLED", await w.State());
    }

    [SchemaV11Fact]
    public async Task RunningAndEndedTours_AreNeverTouched()
    {
        await using var w = await World.Create();
        w.Clock.Now = (await w.HoldEndsAt()).AddHours(1);
        foreach (var (state, sql) in new[]
        {
            ("RUNNING", "UPDATE dbo.Tours SET State = 'RUNNING', StartedAt = SYSDATETIMEOFFSET();"),
            ("COMPLETED", "UPDATE dbo.Tours SET State = 'COMPLETED', StartedAt = SYSDATETIMEOFFSET(), EndedAt = SYSDATETIMEOFFSET();"),
            ("CANCELLED", "UPDATE dbo.Tours SET State = 'CANCELLED', EndedAt = SYSDATETIMEOFFSET(), EndReason = N'Staff huỷ';")
        })
        {
            await w.H.Database.ExecuteAsync(sql);
            Assert.Empty(await w.Due());
            Assert.Equal(AutoCancelOutcome.Skipped, await w.AutoCancel());
            Assert.Equal(state, await w.State());
            await w.H.Database.ExecuteAsync("UPDATE dbo.Tours SET State = 'SCHEDULED', StartedAt = NULL, EndedAt = NULL, EndReason = NULL;");
        }
        // An operational trace keeps a SCHEDULED Tour out of reach, exactly as it does for Staff Cancel.
        await w.H.Database.ExecuteAsync("UPDATE dbo.Tours SET StartedAt = SYSDATETIMEOFFSET();");
        Assert.Equal(AutoCancelOutcome.Skipped, await w.AutoCancel());
        Assert.Equal("SCHEDULED", await w.State());
        await w.AssertNoCancelWritten();
    }

    [SchemaV11Fact]
    public async Task RunningTwice_CancelsOnce_AndQueuesOneNotice()
    {
        await using var w = await World.Create();
        await w.AddRegistration("APPROVED", "approved@example.test");
        w.Clock.Now = await w.HoldEndsAt();
        Assert.Equal(AutoCancelOutcome.Cancelled, await w.AutoCancel());
        Assert.Empty(await w.Due());
        Assert.Equal(AutoCancelOutcome.Skipped, await w.AutoCancel());
        Assert.Equal(1, await w.Count("TOUR_CANCELLED"));
        Assert.Equal(1, await w.Count(TourCancelNoticeAudit.Requested));
    }

    [SchemaV11Fact]
    public async Task OnTime_QueuesTheCancelNotice_ForSubmittedAndApprovedGroups()
    {
        await using var w = await World.Create();
        var approved = await w.AddRegistration("APPROVED", "approved@example.test");
        var rejected = await w.AddRegistration("REJECTED", "rejected@example.test");
        w.Clock.Now = (await w.HoldEndsAt()).AddHours(23);
        Assert.Equal(AutoCancelOutcome.Cancelled, await w.AutoCancel());

        await using var db = w.H.Context();
        var request = await db.AuditLogs.AsNoTracking().SingleAsync(a => a.Action == TourCancelNoticeAudit.Requested);
        Assert.Null(request.ActorUserId);
        Assert.Equal([approved], TourCancelNoticeAudit.RegistrationIds(request));
        Assert.DoesNotContain(rejected, TourCancelNoticeAudit.RegistrationIds(request));
    }

    [SchemaV11Fact]
    public async Task Backlog_IsCancelled_WithoutAnyEmail()
    {
        await using var w = await World.Create();
        await w.AddRegistration("APPROVED", "approved@example.test");
        w.Clock.Now = (await w.HoldEndsAt()).AddHours(24).AddMinutes(1);
        Assert.Equal(AutoCancelOutcome.CancelledWithoutNotice, await w.AutoCancel());

        Assert.Equal("CANCELLED", await w.State());
        await using var db = w.H.Context();
        Assert.Equal(0, await db.AuditLogs.CountAsync(a => a.Action.StartsWith("TOUR_CANCEL_NOTICE_")));
        var receipt = await db.AuditLogs.AsNoTracking().SingleAsync(a => a.Action == "TOUR_CANCELLED");
        using var data = JsonDocument.Parse(receipt.DataJson!);
        Assert.Equal("SKIPPED_BACKLOG", data.RootElement.GetProperty("notice").GetString());
    }

    [SchemaV11Fact]
    public async Task StaffCancelRacingTheJob_HasExactlyOneWinner()
    {
        for (var round = 0; round < 3; round++)
        {
            await using var w = await World.Create();
            await w.AddRegistration("APPROVED", "approved@example.test");
            w.Clock.Now = await w.HoldEndsAt();
            var version = await w.H.Version();
            var staff = Capture(() => w.H.Send(new CancelTourCommand(w.H.TourId, w.H.StaffId, new(Guid.NewGuid(), version, "Staff huỷ"))));
            var job = Capture(() => w.AutoCancel());
            var (staffError, jobError) = (await staff, await job);
            Assert.Null(jobError);
            if (staffError is not null) Assert.IsType<ConflictException>(staffError);

            Assert.Equal("CANCELLED", await w.State());
            Assert.Equal(1, await w.Count("TOUR_CANCELLED"));
            Assert.Equal(1, await w.Count(TourCancelNoticeAudit.Requested));
            await using var db = w.H.Context();
            var receipt = await db.AuditLogs.AsNoTracking().SingleAsync(a => a.Action == "TOUR_CANCELLED");
            Assert.Equal(staffError is null ? "SUCCESS" : TourAutoCancel.ResultCode, receipt.ResultCode);
        }
    }

    [SchemaV11Fact]
    public async Task StaffStartRacingTheJob_LeavesConsistentData()
    {
        await using var w = await World.Create();
        w.Clock.Now = await w.HoldEndsAt();
        var version = await w.H.Version();
        var start = Capture(() => w.H.Send(new StartTourCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), version, new(true, true, true, true)))));
        var job = Capture(() => w.AutoCancel());
        var (startError, jobError) = (await start, await job);
        Assert.Null(jobError);
        // Past the Start window Start is refused, whoever took the lock first.
        Assert.IsType<ConflictException>(startError);
        Assert.Equal("CANCELLED", await w.State());
        Assert.Equal(1, await w.Count("TOUR_CANCELLED"));
        await using var db = w.H.Context();
        Assert.Null(await db.Robots.AsNoTracking().Select(r => r.CurrentTourId).SingleAsync());
    }

    private static async Task<Exception?> Capture(Func<Task> action)
    {
        await Task.Yield();
        try { await action(); return null; }
        catch (Exception error) { return error; }
    }

    private sealed class World(TourReadySqlTests.Harness harness, TourStartPreflightSqlTests.MutableClock clock) : IAsyncDisposable
    {
        public TourReadySqlTests.Harness H => harness;
        public TourStartPreflightSqlTests.MutableClock Clock => clock;

        public static async Task<World> Create()
        {
            var clock = new TourStartPreflightSqlTests.MutableClock();
            var harness = await TourReadySqlTests.Harness.Create(services => services.AddSingleton<TimeProvider>(clock));
            return new(harness, clock);
        }

        public async Task<DateTimeOffset> HoldEndsAt()
        {
            await using var db = H.Context();
            return await db.TourRobotReservations.AsNoTracking().Where(r => r.TourId == H.TourId && r.ReleasedAt == null)
                .Select(r => r.EndsAt).SingleAsync();
        }

        public Task<IReadOnlyList<Guid>> Due() => H.Send(new ListOverdueUnstartedToursQuery());
        public Task<AutoCancelOutcome> AutoCancel() => H.Send(new AutoCancelOverdueTourCommand(H.TourId));

        public async Task<string> State()
        {
            await using var db = H.Context();
            return await db.Tours.AsNoTracking().Where(t => t.Id == H.TourId).Select(t => t.State).SingleAsync();
        }

        public async Task<int> Count(string action)
        {
            await using var db = H.Context();
            return await db.AuditLogs.CountAsync(a => a.TourId == H.TourId && a.Action == action);
        }

        public async Task<Guid> AddRegistration(string state, string email)
        {
            var id = Guid.NewGuid();
            await H.Database.ExecuteAsync($"""
                INSERT dbo.GroupRegistrations (Id, TourId, RepresentativeUserId, SchoolName, GroupName, ContactName, ContactEmail, State, SubmittedAt, CreatedAt)
                VALUES ('{id}', '{H.TourId}', '{H.StaffId}', N'THPT Thử', N'{email}', N'Liên hệ', N'{email}', '{state}', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
                """);
            return id;
        }

        public async Task AssertNoCancelWritten()
        {
            Assert.Equal(0, await Count("TOUR_CANCELLED"));
            await using var db = H.Context();
            Assert.Null(await db.TourRobotReservations.AsNoTracking().Where(r => r.TourId == H.TourId).Select(r => r.ReleasedAt).SingleAsync());
        }

        public ValueTask DisposeAsync() => H.DisposeAsync();
    }
}
