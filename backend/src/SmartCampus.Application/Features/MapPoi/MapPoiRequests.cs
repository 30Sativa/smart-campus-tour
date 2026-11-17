namespace SmartCampus.Application.Features.MapPoi;

public sealed record CreateMapVersionRequest(string AreaKey, string AreaName, Guid RequestId, byte[] PackageBytes);

public sealed record RecordMapDeploymentRequest(
    Guid RequestId, string RobotCode, string PackageSha256,
    bool LocalizationPassed, bool DisplayPassed, string EvidenceNote);

public sealed record PoiProposalDraft(
    Guid MapVersionId, string Name, string Purpose, string? Description,
    decimal X, decimal Y, decimal Yaw, string CameraPreset);

public sealed record CreatePoiProposalRequest(Guid RequestId, PoiProposalDraft Draft);

public sealed record CreatePoiRevisionRequest(
    Guid RequestId, int ExpectedCurrentRevision, string ExpectedRowVersion, PoiProposalDraft Draft);

public sealed record SubmitPoiProposalRequest(
    Guid RequestId, int ExpectedRevisionNumber, string ExpectedRowVersion);

public sealed record DiscardPoiProposalRequest(int ExpectedRevisionNumber, string ExpectedRowVersion);

/// <summary>Body of POST staff/poi-proposals/{id}/retire and /reactivate (ADR-0062).</summary>
public sealed record ChangePoiProposalLifecycleRequest(Guid RequestId, string ExpectedRowVersion);

/// <summary>Creates the POI narration draft when there is none (ExpectedRowVersion absent) or edits it (ADR-0060).</summary>
public sealed record SavePoiNarrationDraftRequest(
    Guid RequestId, string? ExpectedRowVersion, string NarrationText, string? FallbackVideoUrl);

/// <summary>Approves or discards one narration draft (ADR-0060).</summary>
public sealed record ChangePoiNarrationRequest(Guid RequestId, string ExpectedRowVersion);

public sealed record VerifyPoiProposalRequest(
    Guid RequestId, int ExpectedRevisionNumber, string ExpectedRowVersion, string RobotCode,
    string ResultCode, bool Reached, bool Stopped, bool LocalizationPassed,
    bool CameraPresetConfirmed, string? Reason, string EvidenceNote);
public sealed record RetireMapVersionRequest(string Reason, string ExpectedRowVersion);
public sealed record ReopenMapVersionRequest(string? ExpectedRowVersion);
