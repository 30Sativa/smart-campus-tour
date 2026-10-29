using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record PhysicalRobotOption(Guid Id, string RobotCode, string? DisplayName);

public sealed record ListPhysicalRobotsQuery : IRequest<IReadOnlyList<PhysicalRobotOption>>;

public sealed class ListPhysicalRobotsQueryHandler(IPhysicalRobotRepository repository)
    : IRequestHandler<ListPhysicalRobotsQuery, IReadOnlyList<PhysicalRobotOption>>
{
    public async Task<IReadOnlyList<PhysicalRobotOption>> Handle(ListPhysicalRobotsQuery query, CancellationToken ct)
    {
        var robots = await repository.ListPhysicalRobotsAsync(ct);
        return robots.Select(robot => new PhysicalRobotOption(robot.Id, robot.RobotCode, robot.DisplayName)).ToArray();
    }
}
