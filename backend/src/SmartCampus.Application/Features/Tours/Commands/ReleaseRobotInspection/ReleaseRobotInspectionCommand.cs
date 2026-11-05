using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.ReleaseRobotInspection;

public sealed record ReleaseRobotInspectionRequest(Guid RequestId, string ExpectedRowVersion, string Reason);
public sealed record ReleaseRobotInspectionCommand(Guid RobotId, Guid Actor, ReleaseRobotInspectionRequest Request)
    : ITourMutationCommand<ReleaseRobotInspectionResult>;
public sealed record ReleaseRobotInspectionResult(Guid RobotId);

public sealed class ReleaseRobotInspectionCommandValidator : AbstractValidator<ReleaseRobotInspectionCommand>
{
    public ReleaseRobotInspectionCommandValidator()
    {
        RuleFor(c => c.RobotId).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
            RuleFor(c => c.Request.Reason).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(1000);
        });
    }
}

/// <summary>
/// Technical Staff confirm on site that a held robot is safe (ADR-0043 D13): the Tour holding it has ended and it has no
/// open command. Clears the hold and the inspection flag in one conditional update, with an audit row.
/// </summary>
public sealed class ReleaseRobotInspectionCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, TimeProvider clock) : IRequestHandler<ReleaseRobotInspectionCommand, ReleaseRobotInspectionResult>
{
    public async Task<ReleaseRobotInspectionResult> Handle(ReleaseRobotInspectionCommand command, CancellationToken ct)
    {
        var reason = command.Request.Reason.Trim();
        var fingerprint = TourRequestReceipt.Fingerprint(TourLifecycleEvents.InspectionReleased, command.RobotId, reason: reason);
        await repository.LockRequestAsync(command.Actor, command.Request.RequestId, ct);
        if (await repository.FindRobotRequestAsync(command.Actor, command.Request.RequestId, ct) is { } prior)
        {
            using var json = JsonDocument.Parse(prior.DataJson!);
            return prior.RobotId == command.RobotId && json.RootElement.GetProperty("fingerprint").GetString() == fingerprint
                ? new(command.RobotId)
                : throw new ConflictException("Mã yêu cầu đã được dùng cho nội dung khác.", "IDEMPOTENCY_CONFLICT");
        }

        var robot = await TourTarget.FindReservedRobotAsync(revisions, command.RobotId, ct)
            ?? throw new NotFoundException("Không tìm thấy robot.");
        // Tour writers own this root lock, so the Tour cannot leave or enter a running state during the check.
        var tour = robot.CurrentTourId is { } tourId ? await registrations.LockTourAsync(tourId, ct) : null;
        RowVersionToken.EnsureCurrent(robot.RowVersion, command.Request.ExpectedRowVersion);
        if (robot.CurrentTourId is null && !robot.NeedsInspection)
            throw new ConflictException("Robot không bị giữ và không chờ kiểm tra.", "ROBOT_NOT_HELD");
        if (tour is not null && tour.State is not (TourRuntime.Completed or TourRuntime.Cancelled))
            throw new ConflictException("Tour đang giữ robot chưa kết thúc.", "ROBOT_TOUR_ACTIVE");
        if (await repository.HasOpenCommandAsync(robot.Id, ct))
            throw new ConflictException("Robot còn lệnh đang mở hoặc chưa đối soát.", "ROBOT_COMMAND_OPEN");
        if (!await repository.ReleaseInspectionAsync(robot.Id, robot.RowVersion, ct))
            throw new ConflictException("Robot đã thay đổi. Tải lại rồi thử lại.", RowVersionToken.StaleCode);

        repository.AddAudit(new AuditLog
        {
            ActorUserId = command.Actor, RobotId = robot.Id, TourId = tour?.Id, CorrelationId = command.Request.RequestId,
            EntityType = "Robot", EntityId = robot.Id.ToString("D"), Action = TourLifecycleEvents.InspectionReleased,
            ResultCode = "SUCCESS", OccurredAt = clock.GetUtcNow(), DataJson = JsonSerializer.Serialize(new { fingerprint, reason })
        });
        return new(robot.Id);
    }
}
