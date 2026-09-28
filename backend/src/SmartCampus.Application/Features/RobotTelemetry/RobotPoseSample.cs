namespace SmartCampus.Application.Features.RobotTelemetry;

/// <summary>
/// One pose sample as a robot reports it (architecture §3.3, contract in
/// docs/architecture.md "Robot pose telemetry"). Metres and radians in the
/// ROS <c>map</c> frame of <see cref="MapKey"/>, the same frame as
/// <c>Pois.X/Y/Yaw</c> and <c>Routes.Start*</c>.
/// </summary>
/// <param name="RobotCode">Matches <c>Robots.RobotCode</c> and the credential that sent it.</param>
/// <param name="Source">physical, gazebo or emulator; must match the robot's registered source.</param>
/// <param name="MapKey">Which saved map the localization runs on, e.g. campus_v1.</param>
/// <param name="FrameId">ROS frame of x/y/yaw; map for AMCL.</param>
/// <param name="StreamId">New on every bridge start; seq is ordered within a stream.</param>
/// <param name="Seq">Positive, strictly increasing within a stream.</param>
/// <param name="CapturedAt">Robot wall clock (NTP-synced), UTC.</param>
/// <param name="Localized">AMCL has a pose and its covariance is within the robot's threshold.</param>
/// <param name="CovXY">Largest of the x/y position variances in m², when known.</param>
public sealed record RobotPoseSample(
    string RobotCode,
    string Source,
    string MapKey,
    string FrameId,
    Guid StreamId,
    long Seq,
    DateTimeOffset CapturedAt,
    double X,
    double Y,
    double Yaw,
    bool Localized,
    double? CovXY);

/// <summary>A sample the backend accepted, with its own receive time (server clock).</summary>
public sealed record RobotPoseState(RobotPoseSample Sample, DateTimeOffset ReceivedAt, long Version);

/// <summary>The robot a credential belongs to.</summary>
public sealed record RobotIdentity(string RobotCode, string Source);

public static class RobotSources
{
    public const string Physical = "physical";
    public const string Gazebo = "gazebo";
    public const string Emulator = "emulator";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal) { Physical, Gazebo, Emulator };

    /// <summary><c>Robots.SourceType</c> (PHYSICAL/GAZEBO/EMULATOR) to the wire value.</summary>
    public static string FromSourceType(string sourceType) => sourceType.Trim().ToLowerInvariant();
}
