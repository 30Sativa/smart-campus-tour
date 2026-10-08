using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;
using SmartCampus.Application.Features.Representative.Queries.Tours;
using SmartCampus.Application.Features.Representative.Queries.Lists;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRepresentativeRepository
{
    Task<PagedResult<TourReadModel>> ListToursAsync(RepresentativeListRequest request, CancellationToken ct);
    Task<TourReadModel?> GetTourAsync(Guid id, Guid owner, CancellationToken ct);
    Task<PagedResult<RegistrationListItem>> ListRegistrationsAsync(Guid owner, RepresentativeListRequest request, CancellationToken ct);
    Task<RegistrationReadModel?> GetRegistrationAsync(Guid id, Guid owner, CancellationToken ct);
}
