using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

internal static class MapPoiReadModelMapper
{
    public static MapVersionView ToMapView(MapVersion map, string areaName) => new(
        map.Id, map.AreaKey, areaName, map.VersionNumber, map.MapKey, map.PackageFileName,
        Convert.ToHexString(map.PackageSha256).ToLowerInvariant(), map.ImageFileName,
        map.ImageWidth, map.ImageHeight, map.Resolution, map.OriginX, map.OriginY, map.OriginYaw,
        map.Negate, map.OccupiedThreshold, map.FreeThreshold, map.FrameId,
        map.ValidationStatus, map.UploadedByUserId, map.UploadedAt);

    public static MapDeploymentCheckView ToDeploymentView(MapDeploymentCheck check) => new(
        check.Id, check.MapVersionId, check.Robot.RobotCode,
        Convert.ToHexString(check.PackageSha256).ToLowerInvariant(), check.LocalizationPassed,
        check.DisplayPassed, check.LocalizationPassed && check.DisplayPassed,
        check.EvidenceNote, check.CheckedByUserId, check.CheckedAt);

    public static PoiVerificationView ToVerificationView(PoiVerificationRecord record) => new(
        record.Id, record.ProposalRevision.ProposalId, record.ProposalRevisionId,
        record.ProposalRevision.RevisionNumber, record.MapVersionId, record.ProposalRevision.MapVersion.MapKey,
        record.Robot.RobotCode, Convert.ToHexString(record.NavigationFingerprint).ToLowerInvariant(),
        record.ResultCode, record.Reached, record.Stopped, record.LocalizationPassed,
        record.CameraPresetConfirmed, record.Reason, record.EvidenceNote, record.CheckedByUserId, record.CheckedAt,
        record.VerificationMethod, Hex(record.SourceFileSha256));

    public static PoiVerificationView ToVerificationView(PoiVerificationRecord record, PoiProposalRevision revision,
        string mapKey, string robotCode) => new(
        record.Id, revision.ProposalId, record.ProposalRevisionId, revision.RevisionNumber, record.MapVersionId,
        mapKey, robotCode, Convert.ToHexString(record.NavigationFingerprint).ToLowerInvariant(), record.ResultCode,
        record.Reached, record.Stopped, record.LocalizationPassed, record.CameraPresetConfirmed, record.Reason,
        record.EvidenceNote, record.CheckedByUserId, record.CheckedAt, record.VerificationMethod, Hex(record.SourceFileSha256));

    private static string? Hex(byte[]? value) => value is null ? null : Convert.ToHexString(value).ToLowerInvariant();
}
