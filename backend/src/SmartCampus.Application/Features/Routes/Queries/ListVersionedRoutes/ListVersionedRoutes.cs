using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Routes;

public sealed record ListVersionedRoutesQuery(string? Search, Guid? MapVersionId, int Page = 1,
    int Size = 20, string Sort = "name") : IQuery<PagedResult<RouteRevisionView>>;

public sealed class ListVersionedRoutesValidator : AbstractValidator<ListVersionedRoutesQuery>
{
    public ListVersionedRoutesValidator()
    {
        RuleFor(query => query.Page).GreaterThan(0).LessThanOrEqualTo(1_000_000);
        RuleFor(query => query.Size).InclusiveBetween(1, 100);
        RuleFor(query => query.Search).MaximumLength(200);
        RuleFor(query => query.Sort).Must(sort => sort is "name" or "-name" or "createdAt" or "-createdAt");
    }
}

public sealed class ListVersionedRoutesHandler(IRouteRevisionRepository repository)
    : IRequestHandler<ListVersionedRoutesQuery, PagedResult<RouteRevisionView>>
{
    public async Task<PagedResult<RouteRevisionView>> Handle(ListVersionedRoutesQuery query, CancellationToken ct)
    {
        var page = await repository.ListCurrentRevisionIdsAsync(
            string.IsNullOrWhiteSpace(query.Search) ? null : query.Search.Trim(), query.MapVersionId,
            query.Sort, query.Page, query.Size, ct);
        var items = new List<RouteRevisionView>(page.Items.Count);
        foreach (var revisionId in page.Items)
        {
            var revision = await repository.FindRevisionAsync(revisionId, ct)
                ?? throw new InvalidOperationException("The current route revision disappeared while listing routes.");
            items.Add(await RouteRevisionMapper.Load(repository, revision.RouteId, revision.Id, false, ct));
        }
        return new PagedResult<RouteRevisionView>(items, page.Page, page.PageSize, page.TotalItems);
    }
}
