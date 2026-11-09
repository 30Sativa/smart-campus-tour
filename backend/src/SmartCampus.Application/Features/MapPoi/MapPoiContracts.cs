using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record MapVersionView(
    Guid Id, string AreaKey, string AreaName, int VersionNumber, string MapKey,
    string PackageFileName, string PackageSha256, string ImageFileName, int ImageWidth, int ImageHeight,
    decimal Resolution, decimal OriginX, decimal OriginY, decimal OriginYaw, bool Negate,
    decimal OccupiedThreshold, decimal FreeThreshold, string FrameId, string ValidationStatus,
    Guid UploadedByUserId, DateTimeOffset UploadedAt);

public sealed record MapVersionListItem(MapVersionView Map, MapDeploymentCheckView? LatestDeployment,
    string TechnicalCheckStatus, bool CanUseForPoiPreparation, string? PreparationBlockReasonCode,
    string? PreparationBlockReason, MapDeploymentCheckView? PreparationEvidence,
    IReadOnlyList<CurrentlyDeployedRobot> CurrentlyDeployedOn, decimal PoiClearanceMeters,
    int RouteMinStops, decimal RouteMinStopSeparationMeters);

public sealed record CurrentlyDeployedRobot(string RobotCode, DateTimeOffset CheckedAt);

public sealed record MapDeploymentCheckView(
    Guid Id, Guid MapVersionId, string RobotCode, string PackageSha256,
    bool LocalizationPassed, bool DisplayPassed, bool Passed, string EvidenceNote,
    Guid CheckedByUserId, DateTimeOffset CheckedAt);

public sealed record PoiRevisionView(
    Guid Id, int RevisionNumber, Guid MapVersionId, string MapKey, string Name, string Purpose,
    string? Description, decimal X, decimal Y, decimal Yaw, string CameraPreset,
    string NavigationFingerprint, Guid CreatedByUserId, DateTimeOffset CreatedAt,
    bool IsSubmitted, DateTimeOffset? SubmittedAt, string NavigationStatus,
    string? NarrationText, string? FallbackVideoUrl,
    Guid? VerificationSourceRevisionId, string? VerificationMethod = null);

/// <summary>CanDiscard: no revision of this proposal ever passed verification (ADR-0051).</summary>
public sealed record PoiProposalView(Guid Id, int CurrentRevision, string RowVersion, DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt, PoiRevisionView Revision, string? SourcePoiId = null,
    bool CanDiscard = false, DateTimeOffset? DiscardedAt = null);

public sealed record PoiVerificationView(
    Guid Id, Guid ProposalId, Guid ProposalRevisionId, int RevisionNumber, Guid MapVersionId,
    string MapKey, string RobotCode, string NavigationFingerprint, string ResultCode,
    bool? Reached, bool? Stopped, bool? LocalizationPassed, bool? CameraPresetConfirmed,
    string? Reason, string EvidenceNote, Guid CheckedByUserId, DateTimeOffset CheckedAt,
    string VerificationMethod, string? SourceFileSha256);

public sealed record PoiHistoryView(Guid ProposalId, IReadOnlyList<PoiRevisionView> Revisions,
    IReadOnlyList<PoiVerificationView> VerificationRecords);

public sealed record PoiVerificationQueueItem(Guid ProposalId, int CurrentRevision, string RowVersion,
    PoiRevisionView Revision, string? SourcePoiId = null)
{
    public string NavigationStatus => Revision.NavigationStatus;
    public Guid? VerificationSourceRevisionId => Revision.VerificationSourceRevisionId;
}
