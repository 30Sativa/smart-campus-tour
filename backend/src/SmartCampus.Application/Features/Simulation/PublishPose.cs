using FluentValidation;
using MediatR;

namespace SmartCampus.Application.Features.Simulation;

public sealed record SimulationPose(
    string RobotId, string Source, string WorldId, string FrameId,
    Guid StreamId, long Seq, DateTimeOffset CapturedAt,
    double X, double Y, double Z, double Yaw);

public interface ISimulationPosePublisher
{
    Task PublishAsync(SimulationPose pose, CancellationToken cancellationToken);
}

// Transient telemetry deliberately uses IRequest, not a transactional ICommand:
// it must never resolve a database context or commit high-frequency poses to SQL.
public sealed record PublishPose(SimulationPose Pose) : IRequest;

public sealed class PublishPoseValidator : AbstractValidator<PublishPose>
{
    public PublishPoseValidator()
    {
        RuleFor(request => request.Pose).NotNull().DependentRules(() =>
        {
            RuleFor(request => request.Pose.RobotId).Equal("robot_01");
            RuleFor(request => request.Pose.Source).Equal("gazebo");
            RuleFor(request => request.Pose.WorldId).Equal("map3d-preview-v1");
            RuleFor(request => request.Pose.FrameId).Equal("gazebo_world");
            RuleFor(request => request.Pose.StreamId).NotEmpty();
            RuleFor(request => request.Pose.Seq).InclusiveBetween(1, 9007199254740991L);
            RuleFor(request => request.Pose.X).Must(IsCoordinate);
            RuleFor(request => request.Pose.Y).Must(IsCoordinate);
            RuleFor(request => request.Pose.Z).Must(IsCoordinate);
            RuleFor(request => request.Pose.Yaw)
                .Must(value => double.IsFinite(value) && Math.Abs(value) <= Math.PI);
            RuleFor(request => request.Pose.CapturedAt).Must(value =>
                value >= DateTimeOffset.UtcNow.AddSeconds(-10) &&
                value <= DateTimeOffset.UtcNow.AddSeconds(5));
        });
    }

    private static bool IsCoordinate(double value) => double.IsFinite(value) && Math.Abs(value) <= 10000;
}

public sealed class PublishPoseHandler(ISimulationPosePublisher publisher) : IRequestHandler<PublishPose>
{
    public Task Handle(PublishPose request, CancellationToken cancellationToken) =>
        publisher.PublishAsync(request.Pose, cancellationToken);
}
