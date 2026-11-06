using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;

namespace SmartCampus.Application.Features.Tours.Queries.GetTourShifts;

/// <summary>The configured shifts of each day, so the calendar can draw them before a route or robot is chosen.</summary>
public sealed record GetTourShiftsQuery(DateOnly From, DateOnly To) : IQuery<TourShiftsView>;

public sealed class GetTourShiftsQueryValidator : AbstractValidator<GetTourShiftsQuery>
{
    public GetTourShiftsQueryValidator()
    {
        RuleFor(q => q.From).NotEmpty();
        RuleFor(q => q.To).NotEmpty();
        RuleFor(q => q).Must(q => q.From <= q.To).WithMessage("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
        RuleFor(q => q).Must(q => q.To.DayNumber - q.From.DayNumber < TourShiftDays.MaxDays).WithMessage($"Chỉ xem được tối đa {TourShiftDays.MaxDays} ngày.");
    }
}

public sealed class GetTourShiftsQueryHandler(TourScheduleSettings settings) : IRequestHandler<GetTourShiftsQuery, TourShiftsView>
{
    public Task<TourShiftsView> Handle(GetTourShiftsQuery query, CancellationToken ct) =>
        Task.FromResult(new TourShiftsView(TourShiftDays.Expand(settings, query.From, query.To).Select(day => new TourShiftDay(day[0].Date,
            day.Select(item =>
            {
                var (startsAt, endsAt) = TourSchedule.ShiftWindow(item.Date, item.Shift);
                return new TourShiftView(item.Shift.Code, item.Shift.Name, startsAt, endsAt, TourSchedule.TourStart(item.Date, item.Shift),
                    item.Shift.Start.Add(TourSchedule.ReservationBuffer).ToString("HH\\:mm"), TourSchedule.MaxDurationSeconds(item.Shift));
            }).ToArray())).ToArray(), settings.RecommendedMaxSeconds));
}
