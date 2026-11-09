using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Tours.Queries.GetTourSlots;

namespace SmartCampus.Application.Features.Tours.Queries.GetTourShifts;

/// <summary>The configured shifts of each day and their Admin blocks, for the Staff calendar and the Admin schedule page.</summary>
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

public sealed class GetTourShiftsQueryHandler(TourScheduleSettings settings, IScheduleBlockRepository blocks) : IRequestHandler<GetTourShiftsQuery, TourShiftsView>
{
    public async Task<TourShiftsView> Handle(GetTourShiftsQuery query, CancellationToken ct)
    {
        var active = await blocks.ListActiveAsync(query.From, query.To, ct);
        return new TourShiftsView(TourShiftDays.Expand(settings, query.From, query.To).Select(day => new TourShiftDay(day[0].Date,
            day.Select(item =>
            {
                var (startsAt, endsAt) = TourSchedule.ShiftWindow(item.Date, item.Shift);
                return new TourShiftView(item.Shift.Code, item.Shift.Name, startsAt, endsAt, TourSchedule.TourStart(item.Date, item.Shift),
                    item.Shift.Start.Add(TourSchedule.ReservationBuffer).ToString("HH\\:mm"), TourSchedule.MaxDurationSeconds(item.Shift),
                    TourSchedule.BlockOf(active, item));
            }).ToArray())).ToArray(), settings.RecommendedMaxSeconds, (int?)settings.ShortNoticeMinLead?.TotalMinutes);
    }
}
