using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.RosterEmailCorrection.Queries;

public sealed record ListRosterEmailChangesQuery(Guid? RegistrationId, Guid? RepresentativeOwner, string? State)
    : IQuery<IReadOnlyList<RosterEmailChangeView>>;

public sealed class ListRosterEmailChangesQueryHandler(IRosterEmailChangeRepository repository)
    : IRequestHandler<ListRosterEmailChangesQuery, IReadOnlyList<RosterEmailChangeView>>
{
    public async Task<IReadOnlyList<RosterEmailChangeView>> Handle(ListRosterEmailChangesQuery query, CancellationToken ct)
    {
        return await repository.ListAsync(query.RegistrationId, query.RepresentativeOwner, query.State, ct);
    }
}
