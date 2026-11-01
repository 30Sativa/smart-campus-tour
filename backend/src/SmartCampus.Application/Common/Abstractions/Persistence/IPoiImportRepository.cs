using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Common.Abstractions.Persistence;

/// <summary>Persistence operations for POI pose-capture import receipts and source identity.</summary>
public interface IPoiImportRepository
{
    Task<IReadOnlyList<PoiImportReceipt>> ListImportRequestReceiptsAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiImportReceipt>> ListAppliedImportReceiptsAsync(Guid mapVersionId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiProposal>> ListProposalsBySourceAsync(string areaKey, IReadOnlyCollection<string> sourcePoiIds, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<Guid, string>> ListCurrentCameraPresetsAsync(IReadOnlyCollection<Guid> proposalIds, CancellationToken cancellationToken);
    void Add(PoiImportReceipt receipt);
}
