using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Queries.ListTourRobots;

/// <param name="NeedsInspection">
/// Read-only: the robot waits for an on-site check (ADR-0043 D13). Create still accepts it, because it may be released
/// before the Tour starts; only the Start preflight refuses it (robotNotNeedsInspection).
/// </param>
/// <param name="HeldByTourName">For a quick Tour only: another Tour holds the robot over the hold a quick Tour created now would take.</param>
/// <param name="HeldUntil">When that hold ends.</param>
/// <param name="Quick">For a quick Tour only: what a quick Tour created now would get; null when the route cannot size one.</param>
public sealed record TourRobotOption(string RobotCode, string? DisplayName, bool Usable, string? BlockReason,
    bool NeedsInspection = false, string? HeldByTourName = null, DateTimeOffset? HeldUntil = null, QuickTourPreview? Quick = null);

/// <summary>
/// The quick Tour create would make at this moment (B12), by the rule create applies: <see cref="StartBy"/> is its published
/// time, the robot is held from <see cref="HoldStartsAt"/> to <see cref="HoldEndsAt"/>. A preview; create decides again.
/// </summary>
public sealed record QuickTourPreview(int ExpectedDurationSeconds, DateTimeOffset StartBy, DateTimeOffset HoldStartsAt, DateTimeOffset HoldEndsAt);

/// <summary>
/// The Tour form's robot list, judged by the same rule as create and the slots API. <paramref name="Quick"/> also names the
/// Tour already holding each robot over a quick Tour's hold from now; create stays the final check.
/// </summary>
public sealed record ListTourRobotsQuery(Guid RouteRevisionId, bool Quick = false) : IQuery<IReadOnlyList<TourRobotOption>>;

public sealed class ListTourRobotsQueryValidator : AbstractValidator<ListTourRobotsQuery>
{
    public ListTourRobotsQueryValidator() => RuleFor(query => query.RouteRevisionId).NotEmpty();
}

public sealed class ListTourRobotsQueryHandler(IRouteRevisionRepository revisions, IPhysicalRobotRepository robots,
    IMapVersionRepository maps, ITourManagementRepository tours, TourScheduleSettings settings, TimeProvider clock)
    : IRequestHandler<ListTourRobotsQuery, IReadOnlyList<TourRobotOption>>
{
    public async Task<IReadOnlyList<TourRobotOption>> Handle(ListTourRobotsQuery query, CancellationToken ct)
    {
        var revision = await revisions.FindRevisionAsync(query.RouteRevisionId, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản tuyến.");
        var map = await revisions.GetMapAsync(revision.MapVersionId, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản bản đồ.");
        var latest = (await robots.ListLatestDeploymentChecksAsync(ct)).ToDictionary(check => check.RobotId);
        var hold = query.Quick ? await QuickHoldAsync(revision.Id, ct) : null;
        var result = new List<TourRobotOption>();
        foreach (var robot in (await robots.ListPhysicalRobotsAsync(ct)).Where(robot => !robot.IsDeactivated))
        {
            var block = TourTarget.RobotBlockReason(robot, latest.GetValueOrDefault(robot.Id), map, revision);
            var clash = hold is { } window
                ? (await tours.GetActiveReservationsAsync(robot.Id, window.HoldStartsAt, window.HoldEndsAt, ct)).FirstOrDefault()
                : null;
            result.Add(new TourRobotOption(robot.RobotCode, robot.DisplayName, block is null, block, robot.NeedsInspection,
                clash?.TourName, clash?.EndsAt, hold));
        }
        return result;
    }

    /// <summary>
    /// The hold a quick Tour created now would take (CreateTourCommandHandler), or null when the route cannot size one;
    /// create then refuses with its own reason.
    /// </summary>
    private async Task<QuickTourPreview?> QuickHoldAsync(Guid revisionId, CancellationToken ct)
    {
        RouteRevision revision;
        try { (revision, _) = await TourTarget.RequireTestedRevisionAsync(revisions, maps, revisionId, lockTarget: false, ct); }
        catch (ConflictException) { return null; }
        var plan = await TourTarget.PlanReservationAsync(revisions, revision, settings, ct);
        var now = clock.GetUtcNow();
        var startBy = TourSchedule.QuickTourDeadline(now, settings.ShortNoticeMinLead);
        var (startsAt, endsAt) = TourSchedule.QuickTourHold(now, startBy, plan.ExpectedDurationSeconds);
        return new(plan.ExpectedDurationSeconds, startBy, startsAt, endsAt);
    }
}
