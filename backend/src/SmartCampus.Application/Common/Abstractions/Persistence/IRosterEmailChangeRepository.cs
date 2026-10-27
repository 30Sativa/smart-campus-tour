using SmartCampus.Application.Features.RosterEmailCorrection;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

public interface IRosterEmailChangeRepository
{
    Task<Guid?> FindTourIdAsync(Guid requestEntityId, CancellationToken ct);
    Task<Guid?> FindRegistrationIdAsync(Guid requestEntityId, CancellationToken ct);
    Task<RosterEmailChangeRequest?> FindByIdAsync(Guid id, CancellationToken ct);
    Task<RosterEmailChangeRequest?> FindByRequesterRequestIdAsync(Guid requester, Guid requestId, CancellationToken ct);
    Task<bool> IsEmailReservedAsync(Guid tourId, Guid exceptRowId, string normalizedEmail, CancellationToken ct);
    Task<IReadOnlyList<RosterEmailChangeView>> ListAsync(Guid? registrationId, Guid? representativeOwner,
        string? state, CancellationToken ct);
    void Add(RosterEmailChangeRequest request);
}
