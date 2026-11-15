using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record MapVersionView(
    Guid Id, string AreaKey, string AreaName, int VersionNumber, string MapKey,
    string PackageFileName, string PackageSha256, string ImageFileName, int ImageWidth, int ImageHeight,
    decimal Resolution, decimal OriginX, decimal OriginY, decimal OriginYaw, bool Negate,
    decimal OccupiedThreshold, decimal FreeThreshold, string FrameId, string ValidationStatus,
    Guid UploadedByUserId, DateTimeOffset UploadedAt,
    string Status, DateTimeOffset? RetiredAt, Guid? RetiredByUserId, string? RetiredByName, string? RetirementReason,
    string RowVersion);

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
    Guid? VerificationSourceRevisionId, string? VerificationMethod = null);

/// <summary>
/// CanDiscard: no revision of this proposal ever passed verification (ADR-0051). Narration: the current approved and
/// draft narration versions (ADR-0060); every reader fills it.
/// </summary>
public sealed record PoiProposalView(Guid Id, int CurrentRevision, string RowVersion, DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt, PoiRevisionView Revision, string? SourcePoiId = null,
    bool CanDiscard = false, DateTimeOffset? DiscardedAt = null, PoiNarrationSummary? Narration = null);

public sealed record PoiNarrationSummary(PoiNarrationApprovedSummary? Approved, PoiNarrationDraftSummary? Draft);

public sealed record PoiNarrationApprovedSummary(int RevisionNumber, Guid ApprovedByUserId, string ApprovedByName,
    DateTimeOffset ApprovedAt);

public sealed record PoiNarrationDraftSummary(int RevisionNumber, Guid LastEditedByUserId, string LastEditedByName,
    DateTimeOffset LastEditedAt, string RowVersion);

/// <summary>One narration version of a POI (ADR-0060). State: DRAFT, APPROVED, SUPERSEDED or DISCARDED.</summary>
public sealed record PoiNarrationRevisionView(
    Guid Id, Guid ProposalId, int RevisionNumber, string State, string NarrationText, string? FallbackVideoUrl,
    Guid CreatedByUserId, string CreatedByName, DateTimeOffset CreatedAt,
    Guid LastEditedByUserId, string LastEditedByName, DateTimeOffset LastEditedAt,
    Guid? ApprovedByUserId, string? ApprovedByName, DateTimeOffset? ApprovedAt, string RowVersion);

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

/// <summary>What retiring a map version would affect or be blocked by (ADR-0041). Nothing listed is changed.</summary>
public sealed record MapRetirementImpact(
    Guid MapVersionId,
    IReadOnlyList<MapRetirementRoute> Routes,
    IReadOnlyList<MapRetirementRobot> AssignedRobots,
    IReadOnlyList<MapRetirementPendingPoi> PendingPois,
    IReadOnlyList<MapRetirementPendingRoute> PendingRoutes,
    IReadOnlyList<MapRetirementTour> UpcomingTours);

public sealed record MapRetirementRoute(Guid RouteId, string Name, bool IsActive);
public sealed record MapRetirementRobot(Guid RobotId, string RobotCode);
public sealed record MapRetirementPendingPoi(Guid ProposalId, string Name, int RevisionNumber);
public sealed record MapRetirementPendingRoute(Guid RouteId, Guid RevisionId, string Name, int RevisionNumber);
public sealed record MapRetirementTour(Guid TourId, string Name, DateTimeOffset ScheduledStartAt, string State);
