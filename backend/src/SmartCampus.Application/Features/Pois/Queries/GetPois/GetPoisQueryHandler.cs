using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Pois.Dtos;

namespace SmartCampus.Application.Features.Pois.Queries.GetPois;

public sealed class GetPoisQueryHandler(IPoiManagementRepository repository)
    : IRequestHandler<GetPoisQuery, PagedResult<PoiListItemResponse>>
{
    public async Task<PagedResult<PoiListItemResponse>> Handle(
        GetPoisQuery query,
        CancellationToken cancellationToken)
    {
        if (!PoiSortParser.TryParse(query.Request.Sort, out var sort))
            throw new InvalidOperationException("Validated GetPoisQuery contained invalid sort input.");

        var page = await repository.ListAsync(
            string.IsNullOrWhiteSpace(query.Request.Search) ? null : query.Request.Search.Trim(),
            sort,
            query.Request.Page,
            query.Request.Size,
            query.Request.IsActive,
            cancellationToken);

        var items = page.Items.Select(item => new PoiListItemResponse(
            item.Id,
            item.Name,
            item.MapKey,
            item.MapFrame,
            item.X,
            item.Y,
            item.Yaw,
            item.IsActive,
            item.CreatedAt,
            item.UpdatedAt,
            Convert.ToBase64String(item.RowVersion))).ToArray();

        return new PagedResult<PoiListItemResponse>(items, page.Page, page.PageSize, page.TotalItems);
    }
}
