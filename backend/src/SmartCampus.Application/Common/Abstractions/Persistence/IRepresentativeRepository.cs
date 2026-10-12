using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations.Dtos;
using SmartCampus.Application.Features.Representative.Queries.Lists;
using SmartCampus.Application.Features.Representative.Queries.Tours;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRepresentativeRepository
{
    Task<PagedResult<TourReadModel>> ListToursAsync(RepresentativeListRequest request, CancellationToken ct);
    Task<TourReadModel?> GetTourAsync(Guid id, Guid owner, CancellationToken ct);
    Task<PagedResult<RegistrationListItem>> ListRegistrationsAsync(Guid owner, RepresentativeListRequest request, CancellationToken ct);
    Task<RegistrationReadModel?> GetRegistrationAsync(Guid id, Guid owner, CancellationToken ct);
}
