using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations.Dtos;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRegistrationReviewRepository
{
    Task<PagedResult<ReviewListItem>> ListAsync(ReviewListRequest request, CancellationToken ct);
    Task<ReviewReadModel?> GetAsync(Guid id, CancellationToken ct);
}
