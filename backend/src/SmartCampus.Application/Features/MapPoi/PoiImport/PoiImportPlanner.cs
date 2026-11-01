using System.Security.Cryptography;
using FluentValidation;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

internal sealed record PoiImportParsedFile(PoiImportSource Source, byte[] Sha256, PoiCaptureFile? Capture, string? ErrorCode, string? ErrorMessage);

internal sealed record PoiImportPlannedFile(
    PoiImportParsedFile File, decimal? X, decimal? Y, decimal? Yaw, string? Action, string? ErrorCode, string? ErrorMessage,
    PoiImportReceipt? PriorReceipt, PoiProposal? Proposal)
{
    public string FileSha256 => Convert.ToHexString(File.Sha256).ToLowerInvariant();

    public PoiImportPreviewFile ToPreview() => new(File.Source.FileName, FileSha256, File.Capture?.Id, File.Capture?.Name,
        X, Y, Yaw, File.Capture?.Verified, Action, ErrorCode, ErrorMessage);
}

/// <summary>The one validation pass behind preview and import, so they cannot disagree.</summary>
internal static class PoiImportPlanner
{
    public const double MaxYawDifference = 0.01d;
    public const string DefaultCameraPreset = PoiCameraPresets.Front;

    public static IReadOnlyList<PoiImportParsedFile> Parse(IReadOnlyList<PoiImportSource> sources) =>
        sources.Select(ParseFile).ToArray();

    public static async Task<IReadOnlyList<PoiImportPlannedFile>> PlanAsync(
        IPoiImportRepository importRepository, IMapVersionRepository mapRepository, MapVersion map, Robot robot,
        IReadOnlyList<PoiImportParsedFile> files, MapPoiSettings settings, CancellationToken cancellationToken)
    {
        var sourceIds = files.Where(file => file.Capture is not null).Select(file => file.Capture!.Id).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var proposals = sourceIds.Length == 0 ? [] : await importRepository.ListProposalsBySourceAsync(map.AreaKey, sourceIds, cancellationToken);
        var proposalBySource = proposals.ToDictionary(proposal => proposal.SourcePoiId!, StringComparer.OrdinalIgnoreCase);
        var currentCameras = proposals.Count == 0 ? new Dictionary<Guid, string>() :
            await importRepository.ListCurrentCameraPresetsAsync(proposals.Select(proposal => proposal.Id).ToArray(), cancellationToken);
        var applied = (await importRepository.ListAppliedImportReceiptsAsync(map.Id, cancellationToken))
            .ToDictionary(receipt => Convert.ToHexString(receipt.FileSha256));
        var eligibility = await MapPreparationEligibility.LoadAsync(mapRepository, map, cancellationToken);
        var deployed = PoiProposalRules.IsDeployedOn(await mapRepository.GetLatestDeploymentCheckForRobotAsync(robot.Id, cancellationToken), map);
        var package = MapPackageValidator.Validate(map.PackageBytes);

        var sourceCounts = files.Where(file => file.Capture is not null).GroupBy(file => file.Capture!.Id, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
        return files.Select(file => PlanFile(file, map, package, settings, eligibility, deployed, sourceCounts, proposalBySource, currentCameras, applied)).ToArray();
    }

    private static PoiImportParsedFile ParseFile(PoiImportSource source)
    {
        var sha = SHA256.HashData(source.Content);
        if (source.TooLarge)
            return new(source, sha, null, "FILE_TOO_LARGE", $"Tệp vượt quá {PoiCaptureFileParser.MaxFileBytes / 1024} KB.");
        if (!PoiImportFileSet.HasYamlExtension(source.FileName))
            return new(source, sha, null, "INVALID_FILE_TYPE", "Chỉ nhận tệp .yaml hoặc .yml.");
        try
        {
            return new(source, sha, PoiCaptureFileParser.Parse(source.Content), null, null);
        }
        catch (PoiCaptureFileException exception)
        {
            return new(source, sha, null, exception.Code, exception.Message);
        }
    }

    private static PoiImportPlannedFile PlanFile(PoiImportParsedFile file, MapVersion map, ValidatedMapPackage package, MapPoiSettings settings,
        MapPreparationEligibility eligibility, bool deployed, Dictionary<string, int> sourceCounts,
        Dictionary<string, PoiProposal> proposalBySource, IReadOnlyDictionary<Guid, string> currentCameras,
        Dictionary<string, PoiImportReceipt> applied)
    {
        if (file.Capture is not { } capture)
            return new(file, null, null, null, null, file.ErrorCode, file.ErrorMessage, null, null);

        var x = decimal.Round(capture.X, 4, MidpointRounding.AwayFromZero);
        var y = decimal.Round(capture.Y, 4, MidpointRounding.AwayFromZero);
        var yaw = decimal.Round(capture.Yaw, 6, MidpointRounding.AwayFromZero);
        PoiImportPlannedFile Failed(string code, string message) => new(file, x, y, yaw, null, code, message, null, null);

        if (sourceCounts[capture.Id] > 1)
            return Failed("DUPLICATE_SOURCE_ID", $"Có nhiều tệp cùng id {capture.Id} trong lần nhập này.");
        // A file already applied to this exact map stays a no-op even if the robot has moved on since.
        if (applied.TryGetValue(Convert.ToHexString(file.Sha256), out var prior))
            return new(file, x, y, yaw, PoiImportActions.NoChange, null, null, prior, null);
        if (!eligibility.CanUseForPoiPreparation)
            return Failed(eligibility.BlockReasonCode ?? "MAP_NOT_READY_FOR_POI", eligibility.BlockReason ?? "Phiên bản bản đồ chưa sẵn sàng để chuẩn bị POI.");
        if (!string.Equals(capture.MapYaml, package.YamlFileName, StringComparison.Ordinal))
            return Failed("MAP_YAML_MISMATCH", $"Tệp ghi cho {capture.MapYaml}, phiên bản bản đồ đã chọn dùng {package.YamlFileName}.");
        if (!string.Equals(capture.FrameId, map.FrameId, StringComparison.Ordinal))
            return Failed("FRAME_MISMATCH", $"Tệp dùng frame {capture.FrameId}, phiên bản bản đồ dùng frame {map.FrameId}.");
        if (capture.Quaternion is { } quaternion && YawDifference(quaternion.Yaw, (double)capture.Yaw) > MaxYawDifference)
            return Failed("YAW_QUATERNION_MISMATCH", "yaw trong tệp không khớp với quaternion.");
        try
        {
            MapPackageValidator.EnsureClearPosition(package, x, y, yaw, settings.PoiClearanceMeters);
        }
        catch (ValidationException exception) when (exception.Errors.Any(failure => failure.ErrorCode == MapPoiErrorCodes.PoseClearanceInsufficient))
        {
            return Failed(MapPoiErrorCodes.PoseClearanceInsufficient, exception.Errors.First().ErrorMessage);
        }
        catch (ValidationException)
        {
            return Failed("POSE_NOT_FREE", "Pose nằm ngoài bản đồ, sai góc yaw, hoặc không rơi vào ô trống.");
        }
        if (capture.Verified && !deployed)
            return Failed("MAP_NOT_DEPLOYED", "Robot đã chọn chưa có kiểm tra triển khai đạt mới nhất trên đúng phiên bản bản đồ này.");

        var proposal = proposalBySource.GetValueOrDefault(capture.Id);
        // A new capture carries the current camera preset forward, and a file cannot choose one.
        if (proposal is not null && !PoiCameraPresets.IsValid(currentCameras.GetValueOrDefault(proposal.Id)))
            return Failed(MapPoiErrorCodes.CameraPresetInvalid, $"{PoiCameraPresets.InvalidMessage} Staff cần chọn lại hướng camera của POI này trước khi nhập tệp.");
        return new(file, x, y, yaw, proposal is null ? PoiImportActions.Create : PoiImportActions.NewRevision, null, null, null, proposal);
    }

    private static double YawDifference(double first, double second)
    {
        var difference = Math.IEEERemainder(first - second, 2d * Math.PI);
        return Math.Abs(difference);
    }
}
