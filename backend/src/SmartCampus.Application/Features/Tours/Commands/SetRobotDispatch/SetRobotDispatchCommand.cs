using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.SetRobotDispatch;

public sealed record SetRobotDispatchRequest(Guid RequestId, string ExpectedRowVersion, bool? Enabled, string Reason, string? EvidenceRef);
public sealed record SetRobotDispatchCommand(Guid RobotId, Guid Actor, SetRobotDispatchRequest Request)
    : ITourMutationCommand<SetRobotDispatchResult>;
public sealed record SetRobotDispatchResult(Guid RobotId, bool IsDispatchEnabled);

public sealed class SetRobotDispatchCommandValidator : AbstractValidator<SetRobotDispatchCommand>
{
    public SetRobotDispatchCommandValidator()
    {
        RuleFor(c => c.RobotId).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
            RuleFor(c => c.Request.Enabled).NotNull();
            RuleFor(c => c.Request.Reason).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(1000);
            RuleFor(c => c.Request.EvidenceRef).MaximumLength(500);
            When(c => c.Request.Enabled == true, () =>
                RuleFor(c => c.Request.EvidenceRef).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)));
        });
    }
}

/// <summary>
/// Technical Staff allow or stop dispatch to a physical robot (ADR-0049, Decision 8). Stopping always works, whatever the
/// robot's state and even from a stale page, so a person can never be refused the safer choice. Allowing needs an active
/// robot with a key, a map, a passing deployment check on that map, no pending inspection, and a reference to the
/// GATE A record. Neither direction stops a robot that is already moving.
/// </summary>
public sealed class SetRobotDispatchCommandHandler(ITourManagementRepository repository, IRouteRevisionRepository revisions, TimeProvider clock)
    : IRequestHandler<SetRobotDispatchCommand, SetRobotDispatchResult>
{
    public async Task<SetRobotDispatchResult> Handle(SetRobotDispatchCommand command, CancellationToken ct)
    {
        var enabled = command.Request.Enabled!.Value;
        var reason = command.Request.Reason.Trim();
        var evidenceRef = string.IsNullOrWhiteSpace(command.Request.EvidenceRef) ? null : command.Request.EvidenceRef.Trim();
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.DispatchChanged, command.RobotId,
            input: new { enabled, evidenceRef }, reason: reason);
        await repository.LockRequestAsync(command.Actor, command.Request.RequestId, ct);
        if (await repository.FindRobotRequestAsync(command.Actor, command.Request.RequestId, ct) is { } prior)
        {
            using var json = JsonDocument.Parse(prior.DataJson!);
            return prior.RobotId == command.RobotId && json.RootElement.GetProperty("fingerprint").GetString() == fingerprint
                ? new(command.RobotId, enabled)
                : throw new ConflictException("Mã yêu cầu đã được dùng cho nội dung khác.", "IDEMPOTENCY_CONFLICT");
        }

        var robot = await TourTarget.FindReservedRobotAsync(revisions, command.RobotId, ct)
            ?? throw new NotFoundException("Không tìm thấy robot.");
        if (enabled)
        {
            RowVersionToken.EnsureCurrent(robot.RowVersion, command.Request.ExpectedRowVersion);
            await EnsureCanEnableAsync(robot, ct);
        }
        if (!await repository.SetDispatchEnabledAsync(robot.Id, enabled ? robot.RowVersion : null, enabled, ct))
            throw new ConflictException("Robot đã thay đổi. Tải lại rồi thử lại.", RowVersionToken.StaleCode);

        repository.AddAudit(new AuditLog
        {
            ActorUserId = command.Actor, RobotId = robot.Id, CorrelationId = command.Request.RequestId,
            EntityType = "Robot", EntityId = robot.Id.ToString("D"), Action = TourLifecycleEvents.DispatchChanged,
            ResultCode = "SUCCESS", OccurredAt = clock.GetUtcNow(),
            DataJson = JsonSerializer.Serialize(new { fingerprint, enabled, reason, evidenceRef })
        });
        return new(robot.Id, enabled);
    }

    private async Task EnsureCanEnableAsync(Robot robot, CancellationToken ct)
    {
        if (robot.IsDeactivated)
            throw new ConflictException("Robot đã ngừng sử dụng.", "ROBOT_DEACTIVATED");
        if (robot.CredentialHash is null)
            throw new ConflictException("Robot chưa có khóa kết nối đang hiệu lực.", "ROBOT_CREDENTIAL_REQUIRED");
        if (robot.AssignedMapVersionId is null)
            throw new ConflictException("Robot chưa được gán bản đồ.", "ROBOT_MAP_REQUIRED");
        var latest = await revisions.GetLatestDeploymentForRobotAsync(robot.Id, ct);
        if (latest is null || latest.MapVersionId != robot.AssignedMapVersionId || !latest.LocalizationPassed || !latest.DisplayPassed)
            throw new ConflictException("Kiểm tra triển khai mới nhất của robot chưa đạt trên bản đồ đã gán.", "ROBOT_DEPLOYMENT_CHECK_REQUIRED");
        if (robot.NeedsInspection)
            throw new ConflictException("Robot đang chờ kiểm tra tại chỗ.", "ROBOT_NEEDS_INSPECTION");
    }
}
