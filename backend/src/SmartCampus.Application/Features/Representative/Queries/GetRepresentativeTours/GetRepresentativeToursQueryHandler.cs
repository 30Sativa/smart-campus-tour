using SmartCampus.Application.Features.Representative.Queries.Tours;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;

public sealed class GetRepresentativeToursQueryHandler(IRepresentativeRepository repository, TimeProvider clock)
    : IRequestHandler<GetRepresentativeToursQuery, PagedResult<TourResponse>>
{
    public async Task<PagedResult<TourResponse>> Handle(GetRepresentativeToursQuery query, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var page = await repository.ListToursAsync(query.Request, now, ct);
        return new(page.Items.Select(tour => TourResponseMapper.Map(tour, now)).ToArray(), page.Page, page.PageSize, page.TotalItems);
    }
}
