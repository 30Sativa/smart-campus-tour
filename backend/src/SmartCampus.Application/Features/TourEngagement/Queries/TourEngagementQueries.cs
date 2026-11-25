using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.TourEngagement.Queries;

/// <summary>The engagement report of one Tour, for Staff (ADR-0071). Read-only, any state.</summary>
public sealed record GetTourEngagementQuery(Guid TourId) : IQuery<TourEngagementView>;

public sealed class GetTourEngagementQueryHandler(ITourEngagementReader reader, TimeProvider clock)
    : IRequestHandler<GetTourEngagementQuery, TourEngagementView>
{
    public async Task<TourEngagementView> Handle(GetTourEngagementQuery query, CancellationToken ct) =>
        TourEngagementCalculator.Build(await reader.LoadAsync(query.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour."),
            clock.GetUtcNow());
}

/// <summary>Every ended Tour that started in [<see cref="From"/>, <see cref="To"/>), aggregated per POI (ADR-0071).</summary>
public sealed record GetEngagementOverviewQuery(DateTimeOffset From, DateTimeOffset To) : IQuery<EngagementOverviewView>;

public sealed class GetEngagementOverviewQueryValidator : AbstractValidator<GetEngagementOverviewQuery>
{
    public static readonly TimeSpan MaxRange = TimeSpan.FromDays(366);

    public GetEngagementOverviewQueryValidator()
    {
        RuleFor(query => query.To).Must((query, to) => query.From < to)
            .WithMessage("Ngày bắt đầu phải trước ngày kết thúc.");
        RuleFor(query => query.To).Must((query, to) => to - query.From <= MaxRange)
            .WithMessage("Khoảng thời gian tối đa là 366 ngày.");
    }
}

public sealed class GetEngagementOverviewQueryHandler(ITourEngagementReader reader, TimeProvider clock)
    : IRequestHandler<GetEngagementOverviewQuery, EngagementOverviewView>
{
    /// <summary>The most Tours one report reads; a busier period is reported as truncated.</summary>
    public const int MaxTours = 300;

    public async Task<EngagementOverviewView> Handle(GetEngagementOverviewQuery query, CancellationToken ct)
    {
        var tours = await reader.ListEndedAsync(query.From, query.To, MaxTours + 1, ct);
        var truncated = tours.Count > MaxTours;
        return TourEngagementCalculator.Overview(truncated ? tours.Take(MaxTours).ToList() : tours, query.From, query.To, truncated,
            clock.GetUtcNow());
    }
}
