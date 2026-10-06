using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Representative.Dtos;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRepresentativeRepository
{
    Task<PagedResult<TourReadModel>> ListToursAsync(RepresentativeListRequest request, CancellationToken ct);
    Task<TourReadModel?> GetTourAsync(Guid id, Guid owner, CancellationToken ct);
    Task<PagedResult<RegistrationListItem>> ListRegistrationsAsync(Guid owner, RepresentativeListRequest request, CancellationToken ct);
    Task<RegistrationReadModel?> GetRegistrationAsync(Guid id, Guid owner, CancellationToken ct);
    Task<Guid?> FindOwnedTourIdAsync(Guid id, Guid owner, CancellationToken ct);
    Task<Tour?> LockTourAsync(Guid id, CancellationToken ct);
    Task<GroupRegistration?> LockRegistrationAsync(Guid id, Guid owner, CancellationToken ct);
    Task<Guid?> FindSubmissionAsync(Guid owner, Guid tour, Guid key, CancellationToken ct);
    Task<bool> HasInvitationsAsync(Guid registration, CancellationToken ct);
    Task<IReadOnlyList<int>> ReservedEmailIndexesAsync(Guid tour, Guid? excludingRegistration,
        IReadOnlyList<string> emails, CancellationToken ct);
    void AddRegistration(GroupRegistration registration);
    void AddAudit(AuditLog audit);
}
