using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetCamera;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.FleetCamera.Commands.SendHeadsetCommand;

/// <summary>
/// ADR-0056 addendum: a Staff button wakes the robot's Quest headset or puts it to sleep. The press waits in memory for
/// the robot's next camera poll and expires after <see cref="FleetCameraSettings.RobotListeningWithin"/>; quest-stream
/// runs it over adb and the next headset report shows the screen. Refused when the robot or headset cannot take it now,
/// so Staff never wait for a press nobody will run.
/// </summary>
public sealed class SendHeadsetCommandHandler(
    ICameraDemandStore store,
    IRobotCameraReader robots,
    FleetCameraSettings settings,
    TimeProvider clock) : IRequestHandler<SendHeadsetCommand, SendHeadsetCommandResult>
{
    public async Task<SendHeadsetCommandResult> Handle(SendHeadsetCommand request, CancellationToken ct)
    {
        var facts = await robots.GetAsync(request.RobotCode, ct) ?? throw new NotFoundException("Không tìm thấy robot.");
        var now = clock.GetUtcNow();

        if (store.GetLastPoll(facts.RobotCode) is not { } lastPoll || now - lastPoll > settings.RobotListeningWithin)
            throw new ConflictException("Robot chưa kết nối quest-stream với backend, nên không gửi được lệnh cho kính.",
                "HEADSET_ROBOT_NOT_LISTENING");
        if (store.GetHeadset(facts.RobotCode) is not { } headset || now - headset.At > settings.RobotListeningWithin)
            throw new ConflictException("Chưa có trạng thái kính mới từ robot.", "HEADSET_NOT_REPORTED");
        if (headset.Report.Connection != "connected")
            throw new ConflictException("Kính Quest chưa kết nối adb với robot (cắm cáp, bật kính, cho phép USB debugging).",
                "HEADSET_NOT_CONNECTED");
        if (headset.Report.Screen is null)
            throw new ConflictException("quest-stream trên robot chưa hỗ trợ bật/tắt kính; cập nhật quest-stream trên NUC.",
                "HEADSET_CONTROL_UNSUPPORTED");
        if (request.Action == HeadsetActions.Sleep && facts.HasRunningTour)
            throw new ConflictException("Tour đang chạy trên robot này; cho kính ngủ sẽ tắt hình của người xem.",
                "HEADSET_TOUR_RUNNING");

        var command = new HeadsetCommand(Guid.NewGuid(), request.Action, now, now + settings.RobotListeningWithin);
        store.QueueHeadsetCommand(facts.RobotCode, command);
        return new SendHeadsetCommandResult(facts.RobotCode, command.Id, command.Action, command.ExpiresAt);
    }
}
