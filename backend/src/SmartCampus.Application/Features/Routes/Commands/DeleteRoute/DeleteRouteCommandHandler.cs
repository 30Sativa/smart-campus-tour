using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Routes.Commands.DeleteRoute;

public sealed class DeleteRouteCommandHandler(IRouteManagementRepository repository, TimeProvider time)
    : IRequestHandler<DeleteRouteCommand, Unit>
{
    public async Task<Unit> Handle(DeleteRouteCommand command, CancellationToken ct)
    {
        var route = await repository.FindAsync(command.Id, true, ct) ?? throw new NotFoundException("Route was not found.");
        RouteRevision.EnsureCurrent(route, command.ExpectedVersion);
        if (!(await repository.GetUsageAsync(route.Id, ct)).CanDelete)
            throw new ConflictException("Referenced Routes cannot be deleted. Deactivate when permitted.", "ROUTE_IN_USE");
        await repository.ReplaceStopsAsync(route, [], ct);
        repository.Remove(route);
        RouteAudit.Append(repository, command.ActorUserId, route, "ROUTE_DELETED", time.GetUtcNow(), "route");
        return Unit.Value;
    }
}
