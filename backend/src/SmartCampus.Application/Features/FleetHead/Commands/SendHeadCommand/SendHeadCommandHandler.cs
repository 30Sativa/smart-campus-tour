using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetHead;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.FleetHead.Commands.SendHeadCommand;

/// <summary>
/// ADR-0045: the assigned Operator of a RUNNING Tour queues one head command for the Tour's robot. HOME (re-align the
/// head against its stops) is also allowed while the Tour is READY, for the robot it holds. Queued is not executed; the
/// robot reports what the head does on its next poll.
/// </summary>
public sealed class SendHeadCommandHandler(ITourHeadControlReader tours, IHeadCommandChannel channel, FleetHeadSettings settings)
    : IRequestHandler<SendHeadCommand, SendHeadCommandResult>
{
    public const string DisabledCode = "HEAD_CONTROL_DISABLED";
    public const string RobotNotConnectedCode = "HEAD_ROBOT_NOT_CONNECTED";

    public async Task<SendHeadCommandResult> Handle(SendHeadCommand command, CancellationToken ct)
    {
        if (!settings.Enabled)
            throw new ConflictException("Chức năng xoay đầu quay đang tắt.", DisabledCode);
        var tour = await tours.GetAsync(command.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != command.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới xoay được đầu quay.");
        var home = command.Spec.Kind == HeadCommandKinds.Home;
        var robotCode = tour.State == TourRuntime.Running ? tour.RobotCode : home ? tour.HeadRobotCode : null;
        if (string.IsNullOrEmpty(robotCode))
            throw new ConflictException(home
                ? "Chỉ canh chỉnh đầu quay khi Tour đã chốt và giữ robot, hoặc đang chạy."
                : "Chỉ xoay đầu quay khi Tour đang chạy.", "TOUR_STATE_INVALID");
        if (!channel.IsRobotConnected(robotCode))
            throw new ConflictException("Robot chưa nhận lệnh đầu quay (kênh Fleet Head chưa kết nối).", RobotNotConnectedCode);

        var queued = channel.Enqueue(robotCode, Normalize(command.Spec));
        return new SendHeadCommandResult(queued.Seq, robotCode, queued.IssuedAt);
    }

    /// <summary>STEP and JOG always carry both axes on the wire; a missing one means 0.</summary>
    public static HeadCommandSpec Normalize(HeadCommandSpec spec) => spec.Kind switch
    {
        HeadCommandKinds.Step => spec with { PanSteps = spec.PanSteps ?? 0, TiltSteps = spec.TiltSteps ?? 0 },
        HeadCommandKinds.Jog => spec with { PanDir = spec.PanDir ?? 0, TiltDir = spec.TiltDir ?? 0 },
        _ => spec
    };
}
