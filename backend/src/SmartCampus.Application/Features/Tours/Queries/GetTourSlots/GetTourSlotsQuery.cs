using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Queries.GetTourSlots;

public sealed record GetTourSlotsQuery(Guid RouteRevisionId, string RobotCode, DateOnly From, DateOnly To) : IQuery<TourSlotsView>;

public sealed class GetTourSlotsQueryValidator : AbstractValidator<GetTourSlotsQuery>
{
    private const int MaxDays = 31;

    public GetTourSlotsQueryValidator()
    {
        RuleFor(q => q.RouteRevisionId).NotEmpty();
        RuleFor(q => q.RobotCode).NotEmpty().MaximumLength(100);
        RuleFor(q => q.From).NotEmpty();
        RuleFor(q => q.To).NotEmpty();
        RuleFor(q => q).Must(q => q.From <= q.To).WithMessage("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
        RuleFor(q => q).Must(q => q.To.DayNumber - q.From.DayNumber < MaxDays).WithMessage($"Chỉ xem được tối đa {MaxDays} ngày.");
    }
}

public sealed class GetTourSlotsQueryHandler(ITourManagementRepository tours, IRouteRevisionRepository revisions,
    IMapVersionRepository maps, TourScheduleSettings settings, TimeProvider clock) : IRequestHandler<GetTourSlotsQuery, TourSlotsView>
{
    public async Task<TourSlotsView> Handle(GetTourSlotsQuery query, CancellationToken ct)
    {
        var (revision, run) = await TourTarget.RequireTestedRevisionAsync(revisions, maps, query.RouteRevisionId, lockMap: false, ct);
        var robot = await revisions.FindPhysicalRobotAsync(query.RobotCode.Trim(), ct)
            ?? throw new NotFoundException("Không tìm thấy robot vật lý.");
        var plan = await TourTarget.PlanReservationAsync(revisions, revision.Id, run, ct);
        var dates = Enumerable.Range(query.From.DayNumber, query.To.DayNumber - query.From.DayNumber + 1).Select(DateOnly.FromDayNumber).ToArray();
        var holds = plan is null ? [] : await tours.GetActiveReservationsAsync(robot.Id,
            TourSchedule.Window(TourSchedule.SlotStart(dates[0], settings.StartSlots[0]), plan.ExpectedDurationSeconds).StartsAt,
            TourSchedule.Window(TourSchedule.SlotStart(dates[^1], settings.StartSlots[^1]), plan.ExpectedDurationSeconds).EndsAt, ct);
        var now = clock.GetUtcNow();
        return new(query.RouteRevisionId, robot.RobotCode, plan?.MeasuredDurationSeconds, plan?.ExpectedDurationSeconds,
            dates.Select(date => new TourSlotDay(date, settings.StartSlots.Select(slot => Slot(date, slot, now, plan, holds)).ToArray())).ToArray());
    }

    private static TourSlotView Slot(DateOnly date, TimeOnly slot, DateTimeOffset now, TourReservationPlan? plan, IReadOnlyList<TourReservationHold> holds)
    {
        var start = TourSchedule.SlotStart(date, slot);
        var block = TourSchedule.Evaluate(start, now, plan, holds);
        var window = plan is null ? ((DateTimeOffset, DateTimeOffset)?)null : TourSchedule.Window(start, plan.ExpectedDurationSeconds);
        return new(slot.ToString("HH\\:mm"), start, block is null, block?.Code, block?.Message,
            window?.Item1, window?.Item2, start - TourSchedule.RegistrationClose);
    }
}
