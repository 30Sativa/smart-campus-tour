using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Queries.GetTourSlots;

/// <summary>Each configured shift of each day, judged for this revision and robot (docs/lich-tour-theo-ca.md §3).</summary>
public sealed record GetTourSlotsQuery(Guid RouteRevisionId, string RobotCode, DateOnly From, DateOnly To) : IQuery<TourSlotsView>;

public sealed class GetTourSlotsQueryValidator : AbstractValidator<GetTourSlotsQuery>
{
    public GetTourSlotsQueryValidator()
    {
        RuleFor(q => q.RouteRevisionId).NotEmpty();
        RuleFor(q => q.RobotCode).NotEmpty().MaximumLength(100);
        RuleFor(q => q.From).NotEmpty();
        RuleFor(q => q.To).NotEmpty();
        RuleFor(q => q).Must(q => q.From <= q.To).WithMessage("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
        RuleFor(q => q).Must(q => q.To.DayNumber - q.From.DayNumber < TourShiftDays.MaxDays).WithMessage($"Chỉ xem được tối đa {TourShiftDays.MaxDays} ngày.");
    }
}

public sealed class GetTourSlotsQueryHandler(ITourManagementRepository tours, IRouteRevisionRepository revisions,
    IMapVersionRepository maps, IScheduleBlockRepository blocks, TourScheduleSettings settings, TimeProvider clock) : IRequestHandler<GetTourSlotsQuery, TourSlotsView>
{
    public async Task<TourSlotsView> Handle(GetTourSlotsQuery query, CancellationToken ct)
    {
        var (revision, run) = await TourTarget.RequireTestedRevisionAsync(revisions, maps, query.RouteRevisionId, lockTarget: false, ct);
        var robot = await revisions.FindPhysicalRobotAsync(query.RobotCode.Trim(), ct)
            ?? throw new NotFoundException("Không tìm thấy robot vật lý.");
        await TourTarget.RequireUsableRobotAsync(revisions, robot, revision, ct);
        var plan = await TourTarget.PlanReservationAsync(revisions, revision.Id, run, ct);
        var days = TourShiftDays.Expand(settings, query.From, query.To);
        var holds = plan is null ? [] : await tours.GetActiveReservationsAsync(robot.Id,
            TourSchedule.ShiftWindow(days[0][0].Date, days[0][0].Shift).StartsAt,
            TourSchedule.ShiftWindow(days[^1][^1].Date, days[^1][^1].Shift).EndsAt, ct);
        var active = await blocks.ListActiveAsync(query.From, query.To, ct);
        var now = clock.GetUtcNow();
        return new(query.RouteRevisionId, robot.RobotCode, plan?.MeasuredDurationSeconds, plan?.ExpectedDurationSeconds,
            days.Select(day => new TourSlotDay(day[0].Date, day.Select(shift => Slot(shift, now, plan, holds, TourSchedule.BlockOf(active, shift))).ToArray())).ToArray(),
            settings.RecommendedMaxSeconds, settings.MaxCapacity);
    }

    private static TourSlotView Slot(TourShiftOnDay shift, DateTimeOffset now, TourReservationPlan? plan, IReadOnlyList<TourReservationHold> holds, TourShiftBlockView? adminBlock)
    {
        var start = TourSchedule.TourStart(shift.Date, shift.Shift);
        var block = TourSchedule.Evaluate(shift, now, plan, holds, adminBlock);
        var (startsAt, endsAt) = TourSchedule.ShiftWindow(shift.Date, shift.Shift);
        return new(shift.Shift.Start.Add(TourSchedule.ReservationBuffer).ToString("HH\\:mm"), start, block is null, block?.Code, block?.Message,
            startsAt, endsAt, start - TourSchedule.RegistrationClose, shift.Shift.Code, shift.Shift.Name, TourSchedule.MaxDurationSeconds(shift.Shift));
    }
}

/// <summary>The configured shifts of each day in a range, shared by the slot list and the shift calendar.</summary>
internal static class TourShiftDays
{
    public const int MaxDays = 31;

    public static TourShiftOnDay[][] Expand(TourScheduleSettings settings, DateOnly from, DateOnly to) =>
        Enumerable.Range(from.DayNumber, to.DayNumber - from.DayNumber + 1).Select(DateOnly.FromDayNumber)
            .Select(date => settings.Shifts.Select(shift => new TourShiftOnDay(date, shift)).ToArray()).ToArray();
}
