using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Queries.GetQuickTourPlan;

/// <summary>Whether a quick Tour could be created now with this revision and robot (ADR-0053); create decides again under locks.</summary>
public sealed record GetQuickTourPlanQuery(Guid RouteRevisionId, string RobotCode) : IQuery<QuickTourPlanView>;

public sealed class GetQuickTourPlanQueryValidator : AbstractValidator<GetQuickTourPlanQuery>
{
    public GetQuickTourPlanQueryValidator()
    {
        RuleFor(q => q.RouteRevisionId).NotEmpty();
        RuleFor(q => q.RobotCode).NotEmpty().MaximumLength(100);
    }
}

public sealed class GetQuickTourPlanQueryHandler(ITourManagementRepository tours, IRouteRevisionRepository revisions,
    IMapVersionRepository maps, IScheduleBlockRepository blocks, TourScheduleSettings settings, TimeProvider clock)
    : IRequestHandler<GetQuickTourPlanQuery, QuickTourPlanView>
{
    public async Task<QuickTourPlanView> Handle(GetQuickTourPlanQuery query, CancellationToken ct)
    {
        var wait = settings.ShortNoticeMinLead;
        var (revision, run) = await TourTarget.RequireTestedRevisionAsync(revisions, maps, query.RouteRevisionId, lockTarget: false, ct);
        var robot = await revisions.FindPhysicalRobotAsync(query.RobotCode.Trim(), ct)
            ?? throw new NotFoundException("Không tìm thấy robot vật lý.");
        await TourTarget.RequireUsableRobotAsync(revisions, robot, revision, ct);
        var plan = await TourTarget.PlanReservationAsync(revisions, revision.Id, run, ct);
        var now = clock.GetUtcNow();
        var deadline = TourSchedule.QuickTourDeadline(now, wait);
        var hold = plan is null ? ((DateTimeOffset, DateTimeOffset)?)null : TourSchedule.QuickTourHold(now, deadline, plan.ExpectedDurationSeconds);
        var (startsAt, endsAt) = hold ?? (now, deadline);
        var dates = TourSchedule.DatesOf(startsAt, endsAt);
        var holds = plan is null ? [] : await tours.GetActiveReservationsAsync(robot.Id, startsAt, endsAt, ct);
        var block = TourSchedule.EvaluateQuickTour(settings, now, deadline, plan, holds,
            await blocks.ListActiveAsync(dates[0], dates[^1], ct));
        return new(query.RouteRevisionId, robot.RobotCode, plan?.ExpectedDurationSeconds, block is null, block?.Code, block?.Message,
            deadline, hold?.Item1, hold?.Item2, (int)wait.TotalMinutes, settings.MaxCapacity);
    }
}
