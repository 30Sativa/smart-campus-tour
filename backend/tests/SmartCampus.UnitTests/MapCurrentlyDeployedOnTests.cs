using System.Security.Cryptography;
using System.Text;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class MapCurrentlyDeployedOnTests
{
    private static readonly byte[] Sha = Enumerable.Repeat((byte)0x42, 32).ToArray();
    private static readonly MapVersion MapA = new() { Id = Guid.NewGuid(), MapKey = "campus-v1", FrameId = "map", PackageSha256 = Sha };
    private static readonly MapVersion MapB = new() { Id = Guid.NewGuid(), MapKey = "campus-v2", FrameId = "map_v2", PackageSha256 = Sha };

    [Fact]
    public void Latest_matching_pass_is_reported_as_currently_deployed()
    {
        var check = Check("amr_01", MapA, 1);

        Assert.Equal([new CurrentlyDeployedRobot("amr_01", check.CheckedAt)], MapCurrentlyDeployedOn.ForMap(MapA, [check]));
    }

    [Fact]
    public void Newer_fail_on_any_map_supersedes_an_older_pass()
    {
        var earlierPass = Check("amr_01", MapA, 1);
        var latestFail = Check("amr_01", MapB, 2, passed: false);

        Assert.Empty(MapCurrentlyDeployedOn.ForMap(MapA, [earlierPass, latestFail]));
    }

    [Fact]
    public void Moving_robot_to_another_map_removes_only_its_old_map_marker()
    {
        var oldPass = Check("amr_01", MapA, 1);
        var newPass = Check("amr_01", MapB, 2);

        Assert.Empty(MapCurrentlyDeployedOn.ForMap(MapA, [oldPass, newPass]));
        Assert.Equal("amr_01", Assert.Single(MapCurrentlyDeployedOn.ForMap(MapB, [oldPass, newPass])).RobotCode);
    }

    [Fact]
    public void Checksum_mismatch_does_not_mark_map_as_currently_deployed()
    {
        var check = Check("amr_01", MapA, 1);
        check.PackageSha256 = Enumerable.Repeat((byte)0x12, 32).ToArray();

        Assert.Empty(MapCurrentlyDeployedOn.ForMap(MapA, [check]));
    }

    [Fact]
    public void Two_robots_can_be_currently_deployed_on_different_versions()
    {
        var robotA = Check("amr_01", MapA, 1);
        var robotB = Check("amr_02", MapB, 2);
        var all = new[] { robotA, robotB };

        Assert.Equal("amr_01", Assert.Single(MapCurrentlyDeployedOn.ForMap(MapA, all)).RobotCode);
        Assert.Equal("amr_02", Assert.Single(MapCurrentlyDeployedOn.ForMap(MapB, all)).RobotCode);
    }

    private static MapDeploymentCheck Check(string robotCode, MapVersion map, int second, bool passed = true) => new()
    {
        Id = Guid.NewGuid(),
        MapVersionId = map.Id,
        MapVersion = map,
        RobotId = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes(robotCode)).AsSpan(0, 16)),
        Robot = new Robot { RobotCode = robotCode, SourceType = "PHYSICAL" },
        PackageSha256 = map.PackageSha256.ToArray(),
        LocalizationPassed = passed,
        DisplayPassed = passed,
        CheckedAt = DateTimeOffset.UnixEpoch.AddSeconds(second)
    };
}
