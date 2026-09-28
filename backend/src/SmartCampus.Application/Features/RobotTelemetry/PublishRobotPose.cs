using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.RobotTelemetry;

/// <summary>
/// A robot reports its pose. Transient telemetry: an <see cref="IRequest"/>,
/// not a transactional command, so it never opens a unit of work or writes
/// SQL per sample.
/// </summary>
public sealed record PublishRobotPose(string CredentialRobotCode, string CredentialSecret, RobotPoseSample Sample) : IRequest;

public sealed class PublishRobotPoseValidator : AbstractValidator<PublishRobotPose>
{
    public PublishRobotPoseValidator(TimeProvider clock)
    {
        RuleFor(request => request.Sample).NotNull().DependentRules(() =>
        {
            RuleFor(request => request.Sample.RobotCode).NotEmpty().MaximumLength(100);
            RuleFor(request => request.Sample.Source).Must(RobotSources.All.Contains)
                .WithMessage("Source must be physical, gazebo or emulator.");
            RuleFor(request => request.Sample.MapKey).NotEmpty().MaximumLength(100);
            RuleFor(request => request.Sample.FrameId).NotEmpty().MaximumLength(100);
            RuleFor(request => request.Sample.StreamId).NotEmpty();
            RuleFor(request => request.Sample.Seq).InclusiveBetween(1, 9007199254740991L);
            RuleFor(request => request.Sample.X).Must(IsCoordinate);
            RuleFor(request => request.Sample.Y).Must(IsCoordinate);
            RuleFor(request => request.Sample.Yaw).Must(value => double.IsFinite(value) && Math.Abs(value) <= Math.PI);
            RuleFor(request => request.Sample.CovXY)
                .Must(value => value is null || (double.IsFinite(value.Value) && value.Value >= 0 && value.Value <= 1e6));
            RuleFor(request => request.Sample.CapturedAt).Must(value =>
            {
                var now = clock.GetUtcNow();
                return value >= now.AddSeconds(-10) && value <= now.AddSeconds(5);
            }).WithMessage("capturedAt is more than 10 s old or 5 s in the future; check the robot's clock (NTP).");
        });
    }

    private static bool IsCoordinate(double value) => double.IsFinite(value) && Math.Abs(value) <= 10000;
}

public sealed class PublishRobotPoseHandler(
    IRobotCredentialVerifier verifier,
    IRobotTelemetryStore store,
    TimeProvider clock) : IRequestHandler<PublishRobotPose>
{
    public async Task Handle(PublishRobotPose request, CancellationToken cancellationToken)
    {
        var identity = await verifier.VerifyAsync(request.CredentialRobotCode, request.CredentialSecret, cancellationToken)
            ?? throw new UnauthorizedException("Robot credential is not valid.");

        // A credential only speaks for its own robot, and a physical robot
        // cannot report as a simulator (or the reverse): the Twin labels the
        // source, and a Student must never see a synthetic robot as the real one.
        if (!string.Equals(identity.RobotCode, request.Sample.RobotCode, StringComparison.Ordinal))
            throw new UnauthorizedException("This credential belongs to another robot.");
        if (!string.Equals(identity.Source, request.Sample.Source, StringComparison.Ordinal))
            throw new ConflictException($"Robot {identity.RobotCode} is registered as {identity.Source}, not {request.Sample.Source}.");

        store.Accept(request.Sample, clock.GetUtcNow());
    }
}
