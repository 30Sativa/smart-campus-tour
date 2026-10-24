using SmartCampus.Application.Features.Representative.Queries.Tours;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;

public sealed class GetRepresentativeToursQueryHandler(IRepresentativeRepository repository)
    : IRequestHandler<GetRepresentativeToursQuery, PagedResult<TourResponse>>
{
    public async Task<PagedResult<TourResponse>> Handle(GetRepresentativeToursQuery query, CancellationToken ct)
    {
        var page = await repository.ListToursAsync(query.Request, ct);
        return new(page.Items.Select(TourResponseMapper.Map).ToArray(), page.Page, page.PageSize, page.TotalItems);
    }
}
