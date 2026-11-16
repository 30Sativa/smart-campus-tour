using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.CreateScheduleBlock;
using SmartCampus.Application.Features.Tours.Queries.GetTourShifts;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>What the Admin schedule shows before a lock is tried: the Tours in each shift, and which shifts are over (docs/lich-tour-theo-ca.md §5).</summary>
public sealed class ScheduleOccupancyTests
{
    private static readonly TourScheduleSettings Settings = TourShiftsFixture.Settings;
    private static readonly DateOnly Day = new(2026, 12, 1);
    private static TourShift Shift(string code) => Settings.Shifts.Single(shift => shift.Code == code);

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private static FluentValidation.Results.ValidationResult ValidateAt(DateTimeOffset now, string? shift) =>
        new CreateScheduleBlockCommandValidator(Settings, new Clock(now))
            .Validate(new CreateScheduleBlockCommand(Guid.NewGuid(), new(Guid.NewGuid(), Day, shift, "Bảo trì")));

    private const string Ended = "Ca này đã kết thúc, không khoá được nữa.";

    [Fact]
    public void AShiftStillRunning_CanBeClosed_ButOneAlreadyOver_IsRefused()
    {
        // 09:00 in Vietnam: S1 (08:00-10:00) is running.
        var running = TourSchedule.SlotStart(Day, new TimeOnly(9, 0));
        Assert.True(ValidateAt(running, "S1").IsValid);
        // 10:00 sharp: S1 is over, S2 later today and the whole day can still be closed.
        var over = TourSchedule.ShiftWindow(Day, Shift("S1")).EndsAt;
        Assert.Contains(ValidateAt(over, "S1").Errors, error => error.ErrorMessage == Ended);
        Assert.True(ValidateAt(over, "S2").IsValid);
        Assert.True(ValidateAt(over, null).IsValid);
    }

    [Fact]
    public async Task TheAdminCalendar_ListsTheToursInEachShiftAndDay_AndStaffGetsNone()
    {
        var morning = TourSchedule.TourStart(Day, Shift("S1"));
        var (heldFrom, heldTo) = TourSchedule.ShiftWindow(Day, Shift("S1"));
        var shift = new ScheduleBlockingTour(Guid.NewGuid(), "Tour sáng", morning, "SCHEDULED", false, [new(heldFrom, heldTo)]);
        // A quick Tour started at 12:40 holds its robot into the start of S2 (13:00-15:00).
        var quickStart = TourSchedule.SlotStart(Day, new TimeOnly(12, 40));
        var quick = new ScheduleBlockingTour(Guid.NewGuid(), "Tour nhanh", quickStart, "RUNNING", true, [new(quickStart, quickStart.AddMinutes(45))]);
        var nextDay = new ScheduleBlockingTour(Guid.NewGuid(), "Tour hôm sau", morning.AddDays(1), "READY", false, []);
        var blocks = new StubBlocks([shift, quick, nextDay]);
        var handler = new GetTourShiftsQueryHandler(Settings, blocks);

        var view = await handler.Handle(new(Day, Day.AddDays(1), IncludeTours: true), default);
        var today = view.Days[0];
        Assert.Equal([shift.Id], today.Shifts.Single(item => item.Code == "S1").Tours!.Select(tour => tour.Id));
        Assert.Equal([quick.Id], today.Shifts.Single(item => item.Code == "S2").Tours!.Select(tour => tour.Id));
        Assert.Empty(today.Shifts.Single(item => item.Code == "S3").Tours!);
        Assert.Equal([shift.Id, quick.Id], today.Tours!.Select(tour => tour.Id));
        Assert.Equal([nextDay.Id], view.Days[1].Tours!.Select(tour => tour.Id));
        var listed = today.Tours![1];
        Assert.Equal(("Tour nhanh", quickStart, "RUNNING", true, quickStart), (listed.Name, listed.ScheduledStartAt, listed.State, listed.IsShortNotice, listed.RegistrationClosesAt));
        Assert.Equal((TourSchedule.DayWindow(Day).StartsAt, TourSchedule.DayWindow(Day.AddDays(1)).EndsAt), blocks.Asked);

        var staff = await new GetTourShiftsQueryHandler(Settings, new StubBlocks(null)).Handle(new(Day, Day), default);
        Assert.Null(staff.Days[0].Tours);
        Assert.All(staff.Days[0].Shifts, item => Assert.Null(item.Tours));
    }

    private sealed class StubBlocks(IReadOnlyList<ScheduleBlockingTour>? tours) : IScheduleBlockRepository
    {
        public (DateTimeOffset, DateTimeOffset)? Asked { get; private set; }
        public Task<IReadOnlyList<TourScheduleBlock>> ListActiveAsync(DateOnly from, DateOnly to, CancellationToken ct) => Task.FromResult<IReadOnlyList<TourScheduleBlock>>([]);
        public Task<IReadOnlyList<ScheduleBlockingTour>> ListToursInWindowAsync(DateTimeOffset startsAt, DateTimeOffset endsAt, CancellationToken ct)
        {
            Asked = (startsAt, endsAt);
            return Task.FromResult(tours ?? throw new InvalidOperationException("Staff calendar must not read Tours."));
        }
        public Task LockDateAsync(DateOnly date, CancellationToken ct) => throw new NotImplementedException();
        public Task LockRequestAsync(Guid actor, Guid requestId, CancellationToken ct) => throw new NotImplementedException();
        public Task<AuditLog?> FindRequestAsync(Guid actor, Guid requestId, CancellationToken ct) => throw new NotImplementedException();
        public Task<DateOnly?> FindDateAsync(Guid id, CancellationToken ct) => throw new NotImplementedException();
        public Task<TourScheduleBlock?> FindAsync(Guid id, CancellationToken ct) => throw new NotImplementedException();
        public void Add(TourScheduleBlock block) => throw new NotImplementedException();
        public void AddAudit(AuditLog audit) => throw new NotImplementedException();
    }
}
