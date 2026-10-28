using System.Security.Cryptography;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record MapPreparationEligibility(
    string TechnicalCheckStatus,
    bool CanUseForPoiPreparation,
    string? BlockReasonCode,
    string? BlockReason,
    MapDeploymentCheck? Evidence,
    MapDeploymentCheck? LatestDeployment)
{
    public static MapPreparationEligibility Calculate(MapVersion map, IReadOnlyCollection<MapDeploymentCheck> checks)
    {
        // A robot's most recent check for this exact version wins, including FAIL.
        var versionChecks = checks.Where(check => check.MapVersionId == map.Id).ToArray();
        var latestByRobot = versionChecks
            .GroupBy(check => check.RobotId)
            .Select(group => group.OrderByDescending(check => check.CheckedAt)
                .ThenByDescending(check => check.Id).First())
            .ToArray();
        var latestDeployment = versionChecks.OrderByDescending(check => check.CheckedAt)
            .ThenByDescending(check => check.Id).FirstOrDefault();
        var eligible = latestByRobot
            .Where(check => check.Robot.SourceType == "PHYSICAL" &&
                CryptographicOperations.FixedTimeEquals(check.PackageSha256, map.PackageSha256) &&
                check.LocalizationPassed && check.DisplayPassed)
            .OrderByDescending(check => check.CheckedAt).ThenByDescending(check => check.Id)
            .FirstOrDefault();
        if (eligible is not null)
            return new("PASSED", true, null, null, eligible, latestDeployment);

        var evidence = latestByRobot.OrderByDescending(check => check.CheckedAt)
            .ThenByDescending(check => check.Id).FirstOrDefault();
        return evidence is null
            ? new("PENDING", false, "TECHNICAL_CHECK_PENDING", "Chưa có kết quả kiểm tra kỹ thuật cho phiên bản bản đồ này.", null, null)
            : new("FAILED", false, "TECHNICAL_CHECK_NOT_PASSED", "Không có robot nào có kết quả kiểm tra kỹ thuật mới nhất đạt cho phiên bản bản đồ này.", evidence, latestDeployment);
    }

    public static async Task<MapPreparationEligibility> LoadAsync(
        IMapVersionRepository repository, MapVersion map, CancellationToken cancellationToken) =>
        Calculate(map, await repository.ListDeploymentChecksForMapAsync(map.Id, cancellationToken));

    public void EnsureCanUse()
    {
        if (!CanUseForPoiPreparation)
            throw new SmartCampus.Application.Common.Exceptions.ConflictException(BlockReason!,
                BlockReasonCode ?? "MAP_NOT_READY_FOR_POI");
    }
}
