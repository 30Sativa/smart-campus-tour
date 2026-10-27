using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public static class MapPoiAlgorithms
{
    public static byte[] RequestHash<T>(T request) => SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(request));

    public static byte[] NavigationFingerprint(PoiProposalDraft draft)
    {
        var canonical = string.Join('\n',
            draft.MapVersionId.ToString("D"),
            draft.X.ToString("0.0000", CultureInfo.InvariantCulture),
            draft.Y.ToString("0.0000", CultureInfo.InvariantCulture),
            draft.Yaw.ToString("0.000000", CultureInfo.InvariantCulture),
            draft.CameraPreset.Trim().ToUpperInvariant());
        return SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(canonical));
    }

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
        record.CameraPresetConfirmed, record.Reason, record.EvidenceNote, record.CheckedByUserId, record.CheckedAt);

    public static PoiVerificationView ToVerificationView(PoiVerificationRecord record, PoiProposalRevision revision,
        string mapKey, string robotCode) => new(
        record.Id, revision.ProposalId, record.ProposalRevisionId, revision.RevisionNumber, record.MapVersionId,
        mapKey, robotCode, Convert.ToHexString(record.NavigationFingerprint).ToLowerInvariant(), record.ResultCode,
        record.Reached, record.Stopped, record.LocalizationPassed, record.CameraPresetConfirmed, record.Reason,
        record.EvidenceNote, record.CheckedByUserId, record.CheckedAt);
}

public static class PoiProposalRowVersion
{
    public static byte[] Decode(string value)
    {
        try
        {
            var bytes = Convert.FromBase64String(value);
            if (bytes.Length != 8) throw new FormatException();
            return bytes;
        }
        catch (FormatException)
        {
            throw new FluentValidation.ValidationException("ExpectedRowVersion must be a base64 SQL rowversion.");
        }
    }
}
