using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CancelTour;
using SmartCampus.Application.Features.Tours.Commands.CreateScheduleBlock;
using SmartCampus.Application.Features.Tours.Commands.RemoveScheduleBlock;
using SmartCampus.Application.Features.Tours.Queries.GetTourShifts;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;

namespace SmartCampus.IntegrationTests;

/// <summary>Admin day and shift blocks against Tour creation (docs/lich-tour-theo-ca.md §5). The harness Tour sits in S1 of its day.</summary>
public sealed class ScheduleBlockSqlTests
{
    private const string Reason = "Nghỉ lễ";

    private static DateOnly DateOf(TourReadySqlTests.Harness h) => TourSchedule.CampusDate(h.Start);
    /// <summary>S2 of the harness day: 13:15, free.</summary>
    private static DateTimeOffset Afternoon(TourReadySqlTests.Harness h) => TourSchedule.SlotStart(DateOf(h), new TimeOnly(13, 15));

    private static Task<TourShiftBlockView> Close(TourReadySqlTests.Harness h, DateOnly date, string? shift, Guid? requestId = null, string reason = Reason) =>
        h.Send(new CreateScheduleBlockCommand(h.StaffId, new(requestId ?? Guid.NewGuid(), date, shift, reason)));

    private static async Task<string> Refused(Func<Task> action) => (await Assert.ThrowsAsync<ConflictException>(action)).Code;

    [SchemaV11Fact]
    public async Task AShiftOrDayWithATour_CannotBeClosed_AndTheRefusalNamesTheTour()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        foreach (var shift in new[] { "S1", null })
        {
            var refused = await Assert.ThrowsAsync<ConflictException>(() => Close(h, DateOf(h), shift));
            Assert.Equal("SHIFT_HAS_TOURS", refused.Code);
            Assert.Equal(h.TourId.ToString("D"), Assert.Single(refused.Blockers!).Code);
            Assert.Contains("Tour READY", refused.Blockers![0].Message);
        }
        await using var db = h.Context();
        Assert.Empty(await db.TourScheduleBlocks.AsNoTracking().ToArrayAsync());
        Assert.Empty(await db.AuditLogs.AsNoTracking().Where(a => a.EntityType == ScheduleBlockAudit.EntityType).ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task ACancelledTour_NoLongerStopsTheShiftBeingClosed()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        await h.Send(new CancelTourCommand(h.TourId, h.StaffId, new(Guid.NewGuid(), await h.Version(), "Đổi lịch")));
        Assert.Equal(ScheduleBlockScope.Shift, (await Close(h, DateOf(h), "S1")).Scope);
    }

    [SchemaV11Fact]
    public async Task AClosedShift_RefusesTours_ShowsItsReason_AndOpensAgainWhenRemoved()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var date = DateOf(h);
        var block = await Close(h, date, "S2");

        var slots = await h.Send(new GetTourSlotsQuery(h.Route.RevisionId, TourReadySqlTests.Robot, date, date));
        var afternoon = slots.Days.Single().Slots.Single(slot => slot.ShiftCode == "S2");
        Assert.False(afternoon.Available);
        Assert.Equal("SHIFT_BLOCKED", afternoon.ReasonCode);
        Assert.Equal($"Ca này đã bị khoá: {Reason}", afternoon.Reason);
        Assert.Equal("SHIFT_BLOCKED", await Refused(() => h.CreateTour(Afternoon(h))));
        var calendar = await h.Send(new GetTourShiftsQuery(date, date));
        Assert.Equal(block, calendar.Days.Single().Shifts.Single(shift => shift.Code == "S2").Block);
        Assert.Null(calendar.Days.Single().Shifts.Single(shift => shift.Code == "S1").Block);

        var removeRequest = Guid.NewGuid();
        await h.Send(new RemoveScheduleBlockCommand(block.Id, h.StaffId, new(removeRequest)));
        await h.Send(new RemoveScheduleBlockCommand(block.Id, h.StaffId, new(removeRequest)));
        Assert.Equal("SCHEDULE_BLOCK_ALREADY_REMOVED", await Refused(() => h.Send(new RemoveScheduleBlockCommand(block.Id, h.StaffId, new(Guid.NewGuid())))));
        Assert.Null((await h.Send(new GetTourShiftsQuery(date, date))).Days.Single().Shifts.Single(shift => shift.Code == "S2").Block);
        Assert.NotEqual(Guid.Empty, await h.CreateTour(Afternoon(h)));

        await using var db = h.Context();
        var row = await db.TourScheduleBlocks.AsNoTracking().SingleAsync();
        Assert.Equal((h.StaffId, h.StaffId, Reason), (row.CreatedByUserId, row.RemovedByUserId!.Value, row.Reason));
        Assert.NotNull(row.RemovedAt);
        var audits = await db.AuditLogs.AsNoTracking().Where(a => a.EntityType == ScheduleBlockAudit.EntityType).OrderBy(a => a.Id).ToArrayAsync();
        Assert.Equal(["SCHEDULE_BLOCK_CREATED", "SCHEDULE_BLOCK_REMOVED"], audits.Select(a => a.Action));
        Assert.All(audits, audit => Assert.Equal((h.StaffId, block.Id.ToString("D")), (audit.ActorUserId!.Value, audit.EntityId)));
    }

    [SchemaV11Fact]
    public async Task AWholeDayBlock_ClosesEveryShift_AndTheDayAndItsShiftsExcludeEachOther()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var day = DateOf(h).AddDays(1);
        var whole = await Close(h, day, null);
        Assert.Equal(ScheduleBlockScope.Day, whole.Scope);
        Assert.Equal("SCHEDULE_BLOCK_EXISTS", await Refused(() => Close(h, day, null)));
        Assert.Equal("SCHEDULE_BLOCK_EXISTS", await Refused(() => Close(h, day, "S1")));
        Assert.All((await h.Send(new GetTourShiftsQuery(day, day))).Days.Single().Shifts, shift => Assert.Equal(whole, shift.Block));
        var slots = await h.Send(new GetTourSlotsQuery(h.Route.RevisionId, TourReadySqlTests.Robot, day, day));
        Assert.All(slots.Days.Single().Slots, slot => Assert.Equal($"Ngày này đã bị khoá: {Reason}", slot.Reason));
        Assert.Equal("SHIFT_BLOCKED", await Refused(() => h.CreateTour(h.Start.AddDays(1))));

        var other = day.AddDays(1);
        await Close(h, other, "S1");
        Assert.Equal("SCHEDULE_BLOCK_EXISTS", await Refused(() => Close(h, other, "S1")));
        Assert.Equal("SCHEDULE_BLOCK_EXISTS", await Refused(() => Close(h, other, null)));
        Assert.Equal(ScheduleBlockScope.Shift, (await Close(h, other, "S2")).Scope);
    }

    [SchemaV11Fact]
    public async Task ARetriedRequest_ReturnsTheSameBlock_AndChangedContentIsRefused()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var date = DateOf(h).AddDays(1);
        var request = Guid.NewGuid();
        var first = await Close(h, date, "S1", request);
        Assert.Equal(first, await Close(h, date, "S1", request));
        Assert.Equal("IDEMPOTENCY_CONFLICT", await Refused(() => Close(h, date, "S2", request)));
        await using var db = h.Context();
        Assert.Single(await db.TourScheduleBlocks.AsNoTracking().ToArrayAsync());
        Assert.Single(await db.AuditLogs.AsNoTracking().Where(a => a.EntityType == ScheduleBlockAudit.EntityType).ToArrayAsync());
    }

    [SchemaV11Fact]
    public async Task AnUnknownShiftOrBlankReason_IsRefused_AndAnUnknownBlockIsNotFound()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() => Close(h, DateOf(h), "S9"));
        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() => Close(h, DateOf(h), "S2", reason: "   "));
        await Assert.ThrowsAsync<NotFoundException>(() => h.Send(new RemoveScheduleBlockCommand(Guid.NewGuid(), h.StaffId, new(Guid.NewGuid()))));
    }

    [SchemaV11Fact]
    public async Task ACreateAndABlockRacingForOneShift_NeverBothSucceed()
    {
        await using var h = await TourReadySqlTests.Harness.Create();
        var date = DateOf(h);
        for (var round = 0; round < 5; round++)
        {
            var day = date.AddDays(round + 1);
            var start = TourSchedule.SlotStart(day, new TimeOnly(13, 15));
            async Task<string> Attempt(Func<Task> action)
            {
                try { await action(); return "OK"; }
                catch (ConflictException error) { return error.Code; }
            }
            var outcomes = await Task.WhenAll(Attempt(() => h.CreateTour(start)), Attempt(() => Close(h, day, "S2")));
            Assert.Contains(outcomes[0], new[] { "OK", "SHIFT_BLOCKED" });
            Assert.Contains(outcomes[1], new[] { "OK", "SHIFT_HAS_TOURS" });
            Assert.Single(outcomes, outcome => outcome == "OK");
        }
    }
}
