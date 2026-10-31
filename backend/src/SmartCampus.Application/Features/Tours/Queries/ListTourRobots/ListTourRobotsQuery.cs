using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Queries.ListTourRobots;

public sealed record TourRobotOption(string RobotCode, string? DisplayName, bool Usable, string? BlockReason);

/// <summary>The Tour form's robot list, judged by the same rule as create and the slots API.</summary>
public sealed record ListTourRobotsQuery(Guid RouteRevisionId) : IQuery<IReadOnlyList<TourRobotOption>>;

public sealed class ListTourRobotsQueryValidator : AbstractValidator<ListTourRobotsQuery>
{
    public ListTourRobotsQueryValidator() => RuleFor(query => query.RouteRevisionId).NotEmpty();
}

public sealed class ListTourRobotsQueryHandler(IRouteRevisionRepository revisions, IPhysicalRobotRepository robots)
    : IRequestHandler<ListTourRobotsQuery, IReadOnlyList<TourRobotOption>>
{
    public async Task<IReadOnlyList<TourRobotOption>> Handle(ListTourRobotsQuery query, CancellationToken ct)
    {
        var revision = await revisions.FindRevisionAsync(query.RouteRevisionId, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản tuyến.");
        var map = await revisions.GetMapAsync(revision.MapVersionId, ct)
            ?? throw new NotFoundException("Không tìm thấy phiên bản bản đồ.");
        var latest = (await robots.ListLatestDeploymentChecksAsync(ct)).ToDictionary(check => check.RobotId);
        return (await robots.ListPhysicalRobotsAsync(ct)).Where(robot => !robot.IsDeactivated).Select(robot =>
        {
            var block = TourTarget.RobotBlockReason(robot, latest.GetValueOrDefault(robot.Id), map, revision);
            return new TourRobotOption(robot.RobotCode, robot.DisplayName, block is null, block);
        }).ToArray();
    }
}
