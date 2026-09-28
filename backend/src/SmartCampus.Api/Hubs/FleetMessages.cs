using SmartCampus.Application.Features.RobotTelemetry;

namespace SmartCampus.Api.Hubs;

/// <summary>
/// Wire shapes of <c>/hubs/fleet</c>. <c>SentAt</c> and <c>ReceivedAt</c> are
/// both server clock, so a browser computes a sample's age as
/// <c>SentAt − ReceivedAt</c> plus the time since the message arrived,
/// without trusting its own clock.
/// </summary>
public sealed record OperatorRobotPose(
    string RobotCode, string Source, string MapKey, string FrameId,
    double X, double Y, double Yaw, bool Localized, double? CovXY,
    DateTimeOffset CapturedAt, DateTimeOffset ReceivedAt);

public sealed record RobotPosesMessage(DateTimeOffset SentAt, IReadOnlyList<OperatorRobotPose> Robots);

/// <summary>What a Student receives: position and the map it is on; no robot identity, source or health.</summary>
public sealed record StudentRobotPose(string MapKey, double X, double Y, double Yaw, bool Localized, DateTimeOffset ReceivedAt);

public sealed record TourRobotPoseMessage(Guid TourId, DateTimeOffset SentAt, StudentRobotPose? Pose);

public static class FleetMessages
{
    public const string RobotPoses = "RobotPoses";
    public const string TourRobotPose = "TourRobotPose";
    public const string TourRobotEnded = "TourRobotEnded";

    public static RobotPosesMessage Operators(IEnumerable<RobotPoseState> states, DateTimeOffset now) =>
        new(now, states.Select(state => new OperatorRobotPose(
            state.Sample.RobotCode, state.Sample.Source, state.Sample.MapKey, state.Sample.FrameId,
            state.Sample.X, state.Sample.Y, state.Sample.Yaw, state.Sample.Localized, state.Sample.CovXY,
            state.Sample.CapturedAt, state.ReceivedAt)).ToList());

    public static TourRobotPoseMessage Student(Guid tourId, RobotPoseState? state, DateTimeOffset now) =>
        new(tourId, now, state is null ? null : new StudentRobotPose(
            state.Sample.MapKey, state.Sample.X, state.Sample.Y, state.Sample.Yaw, state.Sample.Localized, state.ReceivedAt));
}
