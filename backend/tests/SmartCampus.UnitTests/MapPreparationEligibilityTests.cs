using System.Security.Cryptography;
using System.Text;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class MapPreparationEligibilityTests
{
    private static readonly byte[] Checksum = Enumerable.Repeat((byte)0x2a, 32).ToArray();
    private static readonly MapVersion Version = new() { Id = Guid.NewGuid(), PackageSha256 = Checksum };

    [Fact]
    public void Valid_upload_without_check_is_not_eligible()
    {
        var result = MapPreparationEligibility.Calculate(Version, []);

        Assert.False(result.CanUseForPoiPreparation);
        Assert.Equal("PENDING", result.TechnicalCheckStatus);
        Assert.Equal("TECHNICAL_CHECK_PENDING", result.BlockReasonCode);
    }

    [Fact]
    public void Failed_check_does_not_make_version_eligible()
    {
        var result = MapPreparationEligibility.Calculate(Version, [Check("robot-1", "PHYSICAL", passed: false, at: 1)]);

        Assert.False(result.CanUseForPoiPreparation);
        Assert.Equal("FAILED", result.TechnicalCheckStatus);
    }

    [Fact]
    public void Matching_physical_pass_makes_only_this_version_eligible()
    {
        var result = MapPreparationEligibility.Calculate(Version, [Check("robot-1", "PHYSICAL", passed: true, at: 1)]);
        var newVersion = new MapVersion { Id = Guid.NewGuid(), PackageSha256 = Checksum };
        var newVersionResult = MapPreparationEligibility.Calculate(newVersion, [Check("robot-2", "PHYSICAL", passed: true, at: 2)]);

        Assert.True(result.CanUseForPoiPreparation);
        Assert.Equal("PASSED", result.TechnicalCheckStatus);
        Assert.False(newVersionResult.CanUseForPoiPreparation);
        Assert.Equal("PENDING", newVersionResult.TechnicalCheckStatus);
    }

    [Fact]
    public void A_later_robot_deployment_to_another_map_does_not_clear_old_map_preparation_evidence()
    {
        var passOnA = Check("robot-1", "PHYSICAL", passed: true, at: 1);
        var mapB = new MapVersion { Id = Guid.NewGuid(), PackageSha256 = Checksum };
        var laterDeploymentOnB = Check("robot-1", "PHYSICAL", passed: true, at: 2);
        laterDeploymentOnB.MapVersionId = mapB.Id;

        var result = MapPreparationEligibility.Calculate(Version, [passOnA, laterDeploymentOnB]);

        Assert.True(result.CanUseForPoiPreparation);
        Assert.Equal("robot-1", result.Evidence?.Robot.RobotCode);
        Assert.Equal(DateTimeOffset.UnixEpoch.AddSeconds(1), result.Evidence?.CheckedAt);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void Both_localization_and_display_must_pass(bool localization, bool display)
    {
        var check = Check("robot-1", "PHYSICAL", passed: true, at: 1);
        check.LocalizationPassed = localization;
        check.DisplayPassed = display;

        Assert.False(MapPreparationEligibility.Calculate(Version, [check]).CanUseForPoiPreparation);
    }

    [Fact]
    public void Checksum_mismatch_is_not_eligibility_evidence()
    {
        var check = Check("robot-1", "PHYSICAL", passed: true, at: 1);
        check.PackageSha256 = Enumerable.Repeat((byte)0x11, 32).ToArray();

        var result = MapPreparationEligibility.Calculate(Version, [check]);

        Assert.False(result.CanUseForPoiPreparation);
        Assert.Equal("TECHNICAL_CHECK_NOT_PASSED", result.BlockReasonCode);
    }

    [Fact]
    public void Newer_failure_for_same_robot_supersedes_prior_pass()
    {
        var result = MapPreparationEligibility.Calculate(Version,
        [
            Check("robot-1", "PHYSICAL", passed: true, at: 1),
            Check("robot-1", "PHYSICAL", passed: false, at: 2)
        ]);

        Assert.False(result.CanUseForPoiPreparation);
        Assert.Equal("FAILED", result.TechnicalCheckStatus);
        Assert.Equal("robot-1", result.Evidence?.Robot.RobotCode);
        Assert.Equal(DateTimeOffset.UnixEpoch.AddSeconds(2), result.Evidence?.CheckedAt);
    }

    [Fact]
    public void Another_robot_pass_is_sufficient_and_simulated_robot_is_not()
    {
        var result = MapPreparationEligibility.Calculate(Version,
        [
            Check("sim-1", "GAZEBO", passed: true, at: 3),
            Check("robot-1", "PHYSICAL", passed: false, at: 2),
            Check("robot-2", "PHYSICAL", passed: true, at: 1)
        ]);

        Assert.True(result.CanUseForPoiPreparation);
        Assert.Equal("robot-2", result.Evidence?.Robot.RobotCode);
    }

    private static MapDeploymentCheck Check(string code, string source, bool passed, int at) => new()
    {
        Id = Guid.NewGuid(),
        MapVersionId = Version.Id,
        PackageSha256 = Checksum.ToArray(),
        LocalizationPassed = passed,
        DisplayPassed = passed,
        CheckedAt = DateTimeOffset.UnixEpoch.AddSeconds(at),
        RobotId = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes(code)).AsSpan(0, 16)),
        Robot = new Robot { RobotCode = code, SourceType = source }
    };
}
