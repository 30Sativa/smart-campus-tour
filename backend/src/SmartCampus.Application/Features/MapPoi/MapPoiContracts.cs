using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record MapVersionView(
    Guid Id, string AreaKey, string AreaName, int VersionNumber, string MapKey,
    string PackageFileName, string PackageSha256, string ImageFileName, int ImageWidth, int ImageHeight,
    decimal Resolution, decimal OriginX, decimal OriginY, decimal OriginYaw, bool Negate,
    decimal OccupiedThreshold, decimal FreeThreshold, string FrameId, string ValidationStatus,
    Guid UploadedByUserId, DateTimeOffset UploadedAt);

public sealed record MapVersionListItem(MapVersionView Map, MapDeploymentCheckView? LatestDeployment);

public sealed record MapDeploymentCheckView(
    Guid Id, Guid MapVersionId, string RobotCode, string PackageSha256,
    bool LocalizationPassed, bool DisplayPassed, bool Passed, string EvidenceNote,
    Guid CheckedByUserId, DateTimeOffset CheckedAt);

public sealed record PoiRevisionView(
    Guid Id, int RevisionNumber, Guid MapVersionId, string MapKey, string Name, string Purpose,
    string? Description, decimal X, decimal Y, decimal Yaw, string CameraPreset,
    string NavigationFingerprint, Guid CreatedByUserId, DateTimeOffset CreatedAt,
    bool IsSubmitted, DateTimeOffset? SubmittedAt, string NavigationStatus,
    Guid? VerificationSourceRevisionId);

public sealed record PoiProposalView(Guid Id, int CurrentRevision, string RowVersion, DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt, PoiRevisionView Revision);

public sealed record PoiVerificationView(
    Guid Id, Guid ProposalId, Guid ProposalRevisionId, int RevisionNumber, Guid MapVersionId,
    string MapKey, string RobotCode, string NavigationFingerprint, string ResultCode,
    bool Reached, bool Stopped, bool LocalizationPassed, bool CameraPresetConfirmed,
    string? Reason, string EvidenceNote, Guid CheckedByUserId, DateTimeOffset CheckedAt);

public sealed record PoiHistoryView(Guid ProposalId, IReadOnlyList<PoiRevisionView> Revisions,
    IReadOnlyList<PoiVerificationView> VerificationRecords);

public interface IVersionedMapPoiRepository
{
    Task FlushAsync(CancellationToken cancellationToken);
    Task LockRequestAsync(Guid actorUserId, Guid requestId, string operation, CancellationToken cancellationToken);
    Task<MapArea?> LockAreaAsync(string areaKey, CancellationToken cancellationToken);
    Task<MapArea?> GetAreaAsync(string areaKey, CancellationToken cancellationToken);
    Task<MapVersion?> FindMapUploadRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<int> GetNextMapVersionAsync(string areaKey, CancellationToken cancellationToken);
    Task<MapVersion?> FindMapVersionAsync(Guid id, bool includePackage, CancellationToken cancellationToken);
    Task<IReadOnlyList<MapVersion>> ListMapVersionsAsync(string? areaKey, int take, CancellationToken cancellationToken);
    Task<MapDeploymentCheck?> FindDeploymentRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<Robot?> FindPhysicalRobotAsync(string robotCode, CancellationToken cancellationToken);
    Task<MapDeploymentCheck?> GetLatestDeploymentCheckAsync(Guid mapVersionId, Guid? robotId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MapDeploymentCheck>> ListDeploymentChecksAsync(Guid mapVersionId, CancellationToken cancellationToken);
    Task<PoiProposal?> LockProposalAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<PoiProposal?> FindProposalAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<PoiProposal?> FindProposalCreateRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<PoiProposalRevision?> FindRevisionRequestAsync(Guid proposalId, Guid requestId, CancellationToken cancellationToken);
    Task<PoiProposalRevision?> FindCurrentRevisionAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<PoiProposalRevision?> FindRevisionAsync(Guid proposalId, int revisionNumber, CancellationToken cancellationToken);
    Task<PoiProposalSubmission?> FindSubmissionRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<PoiProposalSubmission?> FindSubmissionAsync(Guid revisionId, CancellationToken cancellationToken);
    Task<PoiVerificationRecord?> FindVerificationRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken);
    Task<PoiVerificationRecord?> FindVerificationAsync(Guid revisionId, CancellationToken cancellationToken);
    Task<PoiVerificationRecord?> FindLatestVerificationByFingerprintAsync(Guid proposalId, byte[] fingerprint, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiProposalRevision>> ListRevisionsAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiVerificationRecord>> ListVerificationRecordsAsync(Guid proposalId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiProposal>> ListProposalsAsync(Guid? mapVersionId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PoiProposalRevision>> ListSubmittedVerificationQueueAsync(Guid? mapVersionId, CancellationToken cancellationToken);
    void Add(MapArea area);
    void Add(MapVersion mapVersion);
    void Add(MapDeploymentCheck deploymentCheck);
    void Add(PoiProposal proposal);
    void Add(PoiProposalRevision revision);
    void Add(PoiProposalSubmission submission);
    void Add(PoiVerificationRecord verification);
    void AddAuditLog(AuditLog auditLog);
}
