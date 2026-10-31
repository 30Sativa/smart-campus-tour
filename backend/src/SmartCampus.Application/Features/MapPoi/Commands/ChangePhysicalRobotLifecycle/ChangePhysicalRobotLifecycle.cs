using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record DeactivatePhysicalRobotRequest(Guid RequestId, string ExpectedRowVersion, string Reason);
public sealed record ActivatePhysicalRobotRequest(Guid RequestId, string ExpectedRowVersion);
public sealed record RobotAffectedTour(Guid TourId, string Name, DateTimeOffset ScheduledStartAt, string State);
public sealed record RobotLifecycleResult(Guid Id, string RobotCode, DateTimeOffset? DeactivatedAt, string? DeactivationReason,
    string RowVersion, IReadOnlyList<RobotAffectedTour> AffectedTours);

public static class RobotLifecycleRules
{
    public const string DeactivatedCode = "ROBOT_DEACTIVATED";

    public static void EnsureActive(Robot robot)
    {
        if (robot.IsDeactivated)
            throw new ConflictException($"Robot {robot.RobotCode} đã ngừng sử dụng.", DeactivatedCode);
    }
}

public sealed record DeactivatePhysicalRobotCommand(Guid RobotId, Guid ActorUserId, DeactivatePhysicalRobotRequest Request)
    : ICommand<RobotLifecycleResult>;

public sealed class DeactivatePhysicalRobotValidator : AbstractValidator<DeactivatePhysicalRobotCommand>
{
    public DeactivatePhysicalRobotValidator()
    {
        RuleFor(command => command.RobotId).NotEmpty();
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
        RuleFor(command => command.Request.Reason).Must(reason => !string.IsNullOrWhiteSpace(reason))
            .WithMessage("Cần nhập lý do ngừng sử dụng.").MaximumLength(500);
    }
}

public sealed class DeactivatePhysicalRobotHandler(IRobotLifecycleManager manager)
    : IRequestHandler<DeactivatePhysicalRobotCommand, RobotLifecycleResult>
{
    public Task<RobotLifecycleResult> Handle(DeactivatePhysicalRobotCommand command, CancellationToken ct) =>
        manager.DeactivateAsync(command.RobotId, command.ActorUserId, command.Request.RequestId,
            command.Request.ExpectedRowVersion, command.Request.Reason.Trim(), ct);
}

public sealed record ActivatePhysicalRobotCommand(Guid RobotId, Guid ActorUserId, ActivatePhysicalRobotRequest Request)
    : ICommand<RobotLifecycleResult>;

public sealed class ActivatePhysicalRobotValidator : AbstractValidator<ActivatePhysicalRobotCommand>
{
    public ActivatePhysicalRobotValidator()
    {
        RuleFor(command => command.RobotId).NotEmpty();
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.ExpectedRowVersion).NotEmpty();
    }
}

public sealed class ActivatePhysicalRobotHandler(IRobotLifecycleManager manager)
    : IRequestHandler<ActivatePhysicalRobotCommand, RobotLifecycleResult>
{
    public Task<RobotLifecycleResult> Handle(ActivatePhysicalRobotCommand command, CancellationToken ct) =>
        manager.ActivateAsync(command.RobotId, command.ActorUserId, command.Request.RequestId,
            command.Request.ExpectedRowVersion, ct);
}

/// <summary>What a map change (or, with no map, taking the robot out of use) would strand.</summary>
public sealed record ListRobotAffectedToursQuery(Guid RobotId, Guid? MapVersionId) : IRequest<IReadOnlyList<RobotAffectedTour>>;

public sealed class ListRobotAffectedToursQueryHandler(IRobotLifecycleManager manager)
    : IRequestHandler<ListRobotAffectedToursQuery, IReadOnlyList<RobotAffectedTour>>
{
    public Task<IReadOnlyList<RobotAffectedTour>> Handle(ListRobotAffectedToursQuery query, CancellationToken ct) =>
        manager.ListAffectedToursAsync(query.RobotId, query.MapVersionId, ct);
}
