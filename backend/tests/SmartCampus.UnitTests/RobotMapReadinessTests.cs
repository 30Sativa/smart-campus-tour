using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

/// <summary>ADR-0066: the one readiness rule, its order and its sentences.</summary>
public sealed class RobotMapReadinessTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 23, 3, 0, 0, TimeSpan.Zero);
    private static readonly MapVersion MapA = Map("tang-6", "Tầng 6", 1, 0x41);
    private static readonly MapVersion MapB = Map("betea", "Betea", 1, 0x42);
    private static readonly FleetSyncSettings Settings = new(TimeSpan.FromMinutes(5), TimeSpan.FromSeconds(30),
        TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(5));

    [Fact]
    public void All_four_conditions_make_the_robot_ready()
    {
        var robot = Robot(MapA);

        var result = RobotMapReadiness.Evaluate(robot, Check(robot, MapA), MapA);

        Assert.True(result.IsReady);
        Assert.Null(result.Code);
        Assert.Null(result.Message);
    }

    [Fact]
    public void Deactivation_is_checked_first()
    {
        var robot = Robot(null, confirmed: false);
        robot.DeactivatedAt = Now;

        Assert.Equal(new RobotMapReadinessResult("ROBOT_DEACTIVATED", "Robot amr_01 đã ngừng sử dụng."),
            RobotMapReadiness.Evaluate(robot, null, MapA));
    }

    [Fact]
    public void Unconfirmed_connection_comes_before_the_assignment()
    {
        var robot = Robot(null, confirmed: false);

        Assert.Equal(new RobotMapReadinessResult("ROBOT_CONNECTION_UNCONFIRMED", "Robot amr_01 chưa xác nhận kết nối."),
            RobotMapReadiness.Evaluate(robot, null, MapA));
    }

    [Fact]
    public void A_robot_without_a_map_is_not_assigned()
    {
        Assert.Equal(new RobotMapReadinessResult("ROBOT_MAP_NOT_ASSIGNED", "Robot amr_01 chưa được gán bản đồ."),
            RobotMapReadiness.Evaluate(Robot(null), null, MapA));
    }

    [Fact]
    public void A_robot_holding_another_map_names_it_even_with_a_pass_on_this_one()
    {
        var robot = Robot(MapA);
        // The 23/11 case: a PASS on Betea while the robot still holds Tầng 6.
        var passOnB = Check(robot, MapB);

        var result = RobotMapReadiness.Evaluate(robot, passOnB, MapB);

        Assert.Equal("ROBOT_MAP_NOT_ASSIGNED", result.Code);
        Assert.Equal("Robot amr_01 đang gán Tầng 6 · tang-6 · phiên bản 1, không phải bản đồ này.", result.Message);
    }

    // Round 3: the sentence says what to do on the map the robot holds, with its assignment time in campus time.
    private const string NoCheckOnMapA = "Robot amr_01 chưa kiểm tra triển khai trên Tầng 6 · tang-6 · phiên bản 1 (gán lúc 23/11 09:55).";

    [Fact]
    public void No_check_at_all_needs_a_deployment_check()
    {
        Assert.Equal(new RobotMapReadinessResult("ROBOT_DEPLOYMENT_CHECK_REQUIRED", NoCheckOnMapA),
            RobotMapReadiness.Evaluate(Robot(MapA), null, MapA));
    }

    [Fact]
    public void Without_an_assignment_time_the_sentence_leaves_it_out()
    {
        var robot = Robot(MapA);
        robot.MapAssignedAt = null;

        Assert.Equal("Robot amr_01 chưa kiểm tra triển khai trên Tầng 6 · tang-6 · phiên bản 1.",
            RobotMapReadiness.Evaluate(robot, null, MapA).Message);
    }

    [Fact]
    public void A_newest_check_on_another_map_says_what_to_do_and_keeps_that_map_as_detail()
    {
        // The amr_01 case of 23/11: assigned Tầng 6 · tang-6 · v1, newest check a PASS on Betea.
        var robot = Robot(MapA);

        var result = RobotMapReadiness.Evaluate(robot, Check(robot, MapB), MapA);

        Assert.Equal("ROBOT_DEPLOYMENT_CHECK_REQUIRED", result.Code);
        Assert.Equal(NoCheckOnMapA, result.Message);
        Assert.Equal("Lần kiểm tra triển khai mới nhất của robot amr_01 là trên Betea · betea · phiên bản 1.", result.Detail);
    }

    [Fact]
    public void A_failed_newest_check_names_its_time_in_campus_time()
    {
        var robot = Robot(MapA);

        var result = RobotMapReadiness.Evaluate(robot, Check(robot, MapA, passed: false), MapA);

        Assert.Equal("ROBOT_DEPLOYMENT_CHECK_REQUIRED", result.Code);
        Assert.Equal(NoCheckOnMapA, result.Message);
        Assert.Equal("Lần kiểm tra triển khai mới nhất của robot amr_01 không đạt (23/11 09:59).", result.Detail);
    }

    [Fact]
    public void A_checksum_mismatch_needs_a_deployment_check()
    {
        var robot = Robot(MapA);
        var check = Check(robot, MapA);
        check.PackageSha256 = Enumerable.Repeat((byte)0x99, 32).ToArray();

        Assert.Equal(new RobotMapReadinessResult("ROBOT_DEPLOYMENT_CHECK_REQUIRED", NoCheckOnMapA),
            RobotMapReadiness.Evaluate(robot, check, MapA));
    }

    [Fact]
    public void A_route_revision_on_another_package_is_refused_by_the_same_rule()
    {
        var robot = Robot(MapA);
        var revision = new RouteRevision { MapVersionId = MapA.Id, MapPackageSha256 = Enumerable.Repeat((byte)0x77, 32).ToArray() };

        Assert.Equal("ROBOT_DEPLOYMENT_CHECK_REQUIRED", RobotMapReadiness.EvaluateForRoute(robot, Check(robot, MapA), MapA, revision).Code);
        Assert.True(RobotMapReadiness.EvaluateForRoute(robot, Check(robot, MapA), MapA,
            new RouteRevision { MapVersionId = MapA.Id, MapPackageSha256 = MapA.PackageSha256 }).IsReady);
    }

    [Fact]
    public void A_report_before_the_assignment_does_not_count()
    {
        var robot = Robot(MapA);

        Assert.False(RobotMapReadiness.IsReportingOnAssignedMap(robot, Report(MapA, robot.MapAssignedAt!.Value.AddSeconds(-1)), Now, Settings));
    }

    [Fact]
    public void A_report_older_than_sync_freshness_does_not_count()
    {
        var robot = Robot(MapA);
        robot.MapAssignedAt = Now.AddMinutes(-10);

        Assert.False(RobotMapReadiness.IsReportingOnAssignedMap(robot, Report(MapA, Now - Settings.SyncFreshness - TimeSpan.FromSeconds(1)), Now, Settings));
        Assert.False(RobotMapReadiness.IsReportingOnAssignedMap(robot, null, Now, Settings));
    }

    [Fact]
    public void A_fresh_report_after_the_assignment_counts()
    {
        var robot = Robot(MapA);

        Assert.True(RobotMapReadiness.IsReportingOnAssignedMap(robot, Report(MapA, Now.AddSeconds(-2)), Now, Settings));
        Assert.False(RobotMapReadiness.IsReportingOnAssignedMap(Robot(null), Report(MapA, Now.AddSeconds(-2)), Now, Settings));
    }

    [Fact]
    public void The_list_chip_separates_not_set_up_from_not_ready()
    {
        var unassigned = RobotMapReadiness.ToView(Robot(null), null, false);
        var unconfirmed = RobotMapReadiness.ToView(Robot(MapA, confirmed: false), null, false);
        var robot = Robot(MapA);
        var notReady = RobotMapReadiness.ToView(robot, Check(robot, MapB), true);
        var ready = RobotMapReadiness.ToView(robot, Check(robot, MapA), true);

        Assert.Equal(("NOT_SET_UP", "ROBOT_MAP_NOT_ASSIGNED"), (unassigned.State, unassigned.ReasonCode));
        Assert.Equal(("NOT_SET_UP", "ROBOT_CONNECTION_UNCONFIRMED"), (unconfirmed.State, unconfirmed.ReasonCode));
        Assert.Equal(("NOT_READY", "ROBOT_DEPLOYMENT_CHECK_REQUIRED"), (notReady.State, notReady.ReasonCode));
        Assert.Null(notReady.DeploymentCheckedAt);
        Assert.Equal(new RobotReadinessView("READY", null, null, MapA.Id, "Tầng 6 · v1", Now.AddMinutes(-1), true), ready);
    }

    [Fact]
    public void Next_step_follows_the_setup_order_and_never_changes_the_state()
    {
        var robot = Robot(MapA);
        var deactivated = Robot(MapA);
        deactivated.DeactivatedAt = Now;

        Assert.Equal(("NOT_SET_UP", "ASSIGN_MAP"), StateAndStep(RobotMapReadiness.ToView(Robot(null), null, false)));
        // Fleet Sync accepts nothing without a map, so the map comes first even before the connection is confirmed.
        Assert.Equal(("NOT_SET_UP", "ASSIGN_MAP"), StateAndStep(RobotMapReadiness.ToView(Robot(null, confirmed: false), null, false)));
        Assert.Equal(("NOT_SET_UP", "CONFIRM_CONNECTION"), StateAndStep(RobotMapReadiness.ToView(Robot(MapA, confirmed: false), null, false)));
        Assert.Equal(("NOT_READY", "CONFIGURE_MINIPC"), StateAndStep(RobotMapReadiness.ToView(robot, Check(robot, MapB), false)));
        Assert.Equal(("NOT_READY", "DEPLOYMENT_CHECK"), StateAndStep(RobotMapReadiness.ToView(robot, Check(robot, MapB), true)));
        Assert.Equal(("READY", null), StateAndStep(RobotMapReadiness.ToView(robot, Check(robot, MapA), true)));
        // A PASS already recorded stays READY even while the bridge is quiet: nextStep is display only.
        Assert.Equal(("READY", null), StateAndStep(RobotMapReadiness.ToView(robot, Check(robot, MapA), false)));
        Assert.Equal(("NOT_READY", null), StateAndStep(RobotMapReadiness.ToView(deactivated, null, false)));
    }

    [Fact]
    public void The_view_carries_the_main_sentence_and_its_detail()
    {
        var robot = Robot(MapA);

        var view = RobotMapReadiness.ToView(robot, Check(robot, MapB), false);

        Assert.Equal(NoCheckOnMapA, view.Reason);
        Assert.Equal("Lần kiểm tra triển khai mới nhất của robot amr_01 là trên Betea · betea · phiên bản 1.", view.Detail);
    }

    private static (string, string?) StateAndStep(RobotReadinessView view) => (view.State, view.NextStep);

    private static MapVersion Map(string areaKey, string areaName, int version, byte sha) => new()
    {
        Id = Guid.NewGuid(), AreaKey = areaKey, VersionNumber = version, MapKey = $"{areaKey}-v{version}", FrameId = "map",
        PackageSha256 = Enumerable.Repeat(sha, 32).ToArray(), AreaKeyNavigation = new MapArea { AreaKey = areaKey, DisplayName = areaName }
    };

    private static Robot Robot(MapVersion? assigned, bool confirmed = true) => new()
    {
        Id = Guid.NewGuid(), RobotCode = "amr_01", SourceType = "PHYSICAL", FirstAcceptedSyncAt = confirmed ? Now.AddDays(-1) : null,
        AssignedMapVersionId = assigned?.Id, AssignedMapVersion = assigned, AssignedAreaKey = assigned?.AreaKey,
        MapAssignedAt = assigned is null ? null : Now.AddMinutes(-5)
    };

    private static MapDeploymentCheck Check(Robot robot, MapVersion map, bool passed = true) => new()
    {
        Id = Guid.NewGuid(), RobotId = robot.Id, Robot = robot, MapVersionId = map.Id, MapVersion = map,
        PackageSha256 = map.PackageSha256, LocalizationPassed = passed, DisplayPassed = true, CheckedAt = Now.AddMinutes(-1)
    };

    private static FleetTelemetrySnapshot Report(MapVersion map, DateTimeOffset receivedAt) => new(
        new FleetRobotIdentity("amr_01", "PHYSICAL", null, false, map.MapKey, map.FrameId),
        new FleetTelemetryReport("amr_01", Guid.NewGuid(), 1, receivedAt, map.MapKey, map.FrameId, null, "IDLE", null, true, true, null, 90),
        receivedAt);
}
