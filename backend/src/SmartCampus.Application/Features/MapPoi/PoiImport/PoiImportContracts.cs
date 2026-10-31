namespace SmartCampus.Application.Features.MapPoi;

public static class PoiVerificationMethods
{
    public const string ManualCheck = "MANUAL_CHECK";
    public const string PoseCapture = "POSE_CAPTURE";
}

public static class PoiImportActions
{
    public const string Create = "CREATE";
    public const string NewRevision = "NEW_REVISION";
    public const string NoChange = "NO_CHANGE";
}

public sealed record PoiImportUpload(string FileName, byte[] Content);

public sealed record PreviewPoiImportRequest(Guid MapVersionId, string RobotCode, IReadOnlyList<PoiImportUpload> Files);

public sealed record ImportPoiFilesRequest(
    Guid RequestId, Guid MapVersionId, string RobotCode, string EvidenceNote, IReadOnlyList<PoiImportUpload> Files);

public sealed record PoiImportPreviewFile(
    string FileName, string FileSha256, string? PoiId, string? Name, decimal? X, decimal? Y, decimal? Yaw,
    bool? Verified, string? Action, string? ErrorCode, string? ErrorMessage);

public sealed record PoiImportPreview(Guid MapVersionId, string RobotCode, bool CanImport, IReadOnlyList<PoiImportPreviewFile> Files);

public sealed record PoiImportedFile(
    string FileName, string PoiId, string Action, bool Verified, Guid ProposalId, Guid ProposalRevisionId);

public sealed record PoiImportResult(
    Guid RequestId, Guid MapVersionId, IReadOnlyList<Guid> CreatedProposalIds,
    IReadOnlyList<Guid> UpdatedProposalIds, IReadOnlyList<PoiImportedFile> Files);
