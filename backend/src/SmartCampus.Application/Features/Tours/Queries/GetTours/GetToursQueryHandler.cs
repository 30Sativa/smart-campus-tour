using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Tours.Queries.GetTours;

public sealed class GetToursQueryHandler(ITourManagementRepository repository, TimeProvider clock) : IRequestHandler<GetToursQuery, PagedResult<TourSummary>>
{
    public Task<PagedResult<TourSummary>> Handle(GetToursQuery query, CancellationToken ct) =>
        repository.ListAsync(query.Request with { Now = clock.GetUtcNow() }, ct);
}
