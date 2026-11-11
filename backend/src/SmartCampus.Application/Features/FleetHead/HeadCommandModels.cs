namespace SmartCampus.Application.Features.FleetHead;

/// <summary>Wire values of <c>kind</c> in docs/contracts/fleet-head/v1.</summary>
public static class HeadCommandKinds
{
    public const string Step = "STEP";
    public const string Jog = "JOG";
    public const string Stop = "STOP";
    public const string Angle = "ANGLE";
    /// <summary>
    /// Automatic look-around: the robot turns PAN left, then right, then back to where it started; optional
    /// <c>sweepDeg</c> per side, otherwise the robot's default (135°).
    /// </summary>
    public const string Sweep = "SWEEP";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal) { Step, Jog, Stop, Angle, Sweep };
}

/// <summary>
/// Per-Tour head mode: AUTO does what each POI's camera preset says at arrival and turns to the front when the Tour
/// leaves; MANUAL only follows the Operator's buttons (a quick switch-off of the POI presets).
/// </summary>
public static class HeadModes
{
    public const string Manual = "MANUAL";
    public const string Auto = "AUTO";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal) { Manual, Auto };
}

/// <summary>Wire values of <c>head.state</c>, mapped from stm32_bridge <c>head/state</c>.</summary>
public static class HeadStates
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
        { "OFF", "IDLE", "MOVING", "HOMING", "NO_REFERENCE", "UNKNOWN" };
}

/// <summary>What the Operator asked for; only the fields of <see cref="Kind"/> are set.</summary>
public sealed record HeadCommandSpec(
    string Kind,
    int? PanSteps = null,
    int? TiltSteps = null,
    int? PanDir = null,
    int? TiltDir = null,
    double? PanDeg = null,
    double? TiltDeg = null,
    int? SweepDeg = null);

/// <summary>A queued command as the robot receives it. <see cref="TtlMs"/> is set for JOG only.</summary>
public sealed record HeadCommand(
    long Seq,
    string Kind,
    DateTimeOffset IssuedAt,
    int? PanSteps,
    int? TiltSteps,
    int? PanDir,
    int? TiltDir,
    double? PanDeg,
    double? TiltDeg,
    int? TtlMs,
    int? SweepDeg = null);

/// <summary>The robot's latest <c>head/state</c>, as reported on its poll.</summary>
public sealed record HeadStateReport(
    string State,
    bool Referenced,
    double? PanDeg,
    double? TiltDeg,
    DateTimeOffset? ObservedAt);

public sealed record HeadPollBatch(Guid Epoch, IReadOnlyList<HeadCommand> Commands);

public sealed record HeadRobotStatus(
    bool Connected,
    DateTimeOffset? LastPollAt,
    HeadStateReport? Head,
    DateTimeOffset? HeadReceivedAt);
