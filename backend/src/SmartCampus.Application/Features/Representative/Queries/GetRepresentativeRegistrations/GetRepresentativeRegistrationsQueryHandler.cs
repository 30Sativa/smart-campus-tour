using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;

public sealed class GetRepresentativeRegistrationsQueryHandler(IRepresentativeRepository repository)
    : IRequestHandler<GetRepresentativeRegistrationsQuery, PagedResult<RegistrationListItem>>
{
    public Task<PagedResult<RegistrationListItem>> Handle(GetRepresentativeRegistrationsQuery query, CancellationToken ct) =>
        repository.ListRegistrationsAsync(query.Owner, query.Request, ct);
}
