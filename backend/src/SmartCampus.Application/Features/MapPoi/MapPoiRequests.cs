namespace SmartCampus.Application.Features.MapPoi;

public sealed record CreateMapVersionRequest(string AreaKey, string AreaName, Guid RequestId, byte[] PackageBytes);

public sealed record RecordMapDeploymentRequest(
    Guid RequestId, string RobotCode, string PackageSha256,
    bool LocalizationPassed, bool DisplayPassed, string EvidenceNote);

public sealed record PoiProposalDraft(
    Guid MapVersionId, string Name, string Purpose, string? Description,
    decimal X, decimal Y, decimal Yaw, string CameraPreset,
    string? NarrationText = null, string? FallbackVideoUrl = null);

public sealed record CreatePoiProposalRequest(Guid RequestId, PoiProposalDraft Draft);

public sealed record CreatePoiRevisionRequest(
    Guid RequestId, int ExpectedCurrentRevision, string ExpectedRowVersion, PoiProposalDraft Draft);

public sealed record SubmitPoiProposalRequest(
    Guid RequestId, int ExpectedRevisionNumber, string ExpectedRowVersion);

public sealed record VerifyPoiProposalRequest(
    Guid RequestId, int ExpectedRevisionNumber, string ExpectedRowVersion, string RobotCode,
    string ResultCode, bool Reached, bool Stopped, bool LocalizationPassed,
    bool CameraPresetConfirmed, string? Reason, string EvidenceNote);
