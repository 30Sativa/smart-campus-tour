using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations.Dtos;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

public sealed class ListRegistrationsQueryHandler(IRegistrationReviewRepository repository)
    : IRequestHandler<ListRegistrationsQuery, PagedResult<ReviewListItem>>
{
    public Task<PagedResult<ReviewListItem>> Handle(ListRegistrationsQuery query, CancellationToken ct) =>
        repository.ListAsync(query.Request, ct);
}
