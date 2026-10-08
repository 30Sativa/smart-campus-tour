using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRegistrationReviewRepository
{
    Task<PagedResult<ReviewListItem>> ListAsync(ReviewListRequest request, CancellationToken ct);
    Task<ReviewReadModel?> GetAsync(Guid id, CancellationToken ct);
}
