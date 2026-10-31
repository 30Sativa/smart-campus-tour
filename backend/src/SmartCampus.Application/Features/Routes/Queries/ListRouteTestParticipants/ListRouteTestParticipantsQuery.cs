using MediatR;
using SmartCampus.Application.Common.Authentication;

namespace SmartCampus.Application.Features.Routes;

public sealed record ListRouteTestParticipantsQuery() : IRequest<IReadOnlyList<RouteTestParticipantView>>;

public sealed class ListRouteTestParticipantsHandler(IRouteRevisionRepository repo)
    : IRequestHandler<ListRouteTestParticipantsQuery, IReadOnlyList<RouteTestParticipantView>>
{
    public async Task<IReadOnlyList<RouteTestParticipantView>> Handle(ListRouteTestParticipantsQuery query, CancellationToken ct)
    {
        var users = await repo.ListActiveStaffUsersAsync(ct);
        // Same test as RecordRouteTestRun, so every listed account can be recorded.
        return users
            .Where(user => ApplicationRoles.TryResolve(user.UserRoles.Select(role => role.Role), out var resolved) &&
                resolved == ApplicationRoles.Staff)
            .Select(user => new RouteTestParticipantView(user.Id, user.FullName, user.Username))
            .ToArray();
    }
}
