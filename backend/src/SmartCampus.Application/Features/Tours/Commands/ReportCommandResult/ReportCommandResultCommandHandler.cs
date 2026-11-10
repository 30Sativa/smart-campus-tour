using System.Globalization;
using System.Text.Json;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FleetHead;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.ReportCommandResult;

/// <summary>
/// Records one robot result under the Tour lock (ADR-0042 §3). The acknowledgement follows the commit, an exact repeat has
/// no further effect, and only a result for the Tour's current leg moves the Tour; any other is recorded and changes nothing.
/// Accepted whatever <c>FleetCommands:Enabled</c> says: what the robot reports it did is never refused.
/// </summary>
public sealed class ReportCommandResultCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, HeadAutoMotion headMotion, TimeProvider clock)
    : IRequestHandler<ReportCommandResultCommand, CommandResultAck>
{
    public async Task<CommandResultAck> Handle(ReportCommandResultCommand result, CancellationToken ct)
    {
        var known = await repository.FindCommandAsync(result.CommandId, ct);
        if (known is null || await revisions.GetRobotCodeAsync(known.RobotId, ct) != result.RobotCode)
            throw new NotFoundException("Không tìm thấy lệnh của robot này.", "COMMAND_NOT_FOUND");
        var tour = await registrations.LockTourAsync(known.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour của lệnh.");
        var command = await repository.LockCommandAsync(result.CommandId, ct) ?? throw new NotFoundException("Không tìm thấy lệnh của robot này.", "COMMAND_NOT_FOUND");

        if (command.LegId != result.LegId)
            throw new ConflictException("Kết quả không thuộc chặng của lệnh.", "RESULT_CONFLICT");
        if (command.DeliveredStreamId is null)
            throw NotAllowed();
        if (command.DeliveredStreamId != result.StreamId)
            throw new ConflictException("Kết quả không đến từ stream đã nhận lệnh.", "RESULT_STREAM_MISMATCH");

        var eventType = EventType(result.Phase);
        var content = Content(result);
        if (await repository.FindCommandEventAsync(command.Id, eventType, ct) is { } recorded)
            return Stored(recorded) == content ? new(true, true, command.State)
                : throw new ConflictException("Phase này đã được ghi với nội dung khác.", "RESULT_CONFLICT");

        var now = clock.GetUtcNow();
        var wasUnknown = command.State == RobotCommandStates.Unknown;
        Transition(command, result, now);
        var current = command.Kind == RobotCommandKinds.GoTo && !wasUnknown && tour.State == TourRuntime.Running &&
            tour.OperationalStatus == TourRuntime.Normal && tour.CurrentLegId == command.LegId;
        repository.AddEvent(new TourEvent
        {
            TourId = tour.Id, EventType = eventType, OccurredAt = now, RobotId = command.RobotId, RouteId = tour.ActiveRouteId,
            LegId = command.LegId, LegKind = command.LegKind, CommandId = command.Id, ReasonCode = result.Reason,
            DataJson = JsonSerializer.Serialize(new { result = content, applied = current })
        });
        if (command.Kind == RobotCommandKinds.GoTo && !command.IsOpen &&
            await repository.LockOpenCancelAsync(command.Id, ct) is { } cancel)
            cancel.CloseCancel(now);
        if (current) await ApplyToTourAsync(tour, command, result.RobotCode, now, ct);
        return new(true, false, command.State);
    }

    private static void Transition(RobotCommand command, ReportCommandResultCommand result, DateTimeOffset now)
    {
        switch (result.Phase, command.State)
        {
            case (CommandResultPhases.Accepted, RobotCommandStates.Delivered):
                command.Accept(now);
                break;
            case (CommandResultPhases.Accepted, RobotCommandStates.Unknown):
                break; // A late ACCEPTED is recorded; the command stays UNKNOWN.
            case (CommandResultPhases.Rejected, RobotCommandStates.Delivered):
                command.Reject(now, result.Reason);
                break;
            case (CommandResultPhases.Terminal, RobotCommandStates.Delivered or RobotCommandStates.Accepted or RobotCommandStates.Unknown)
                when command.Kind == RobotCommandKinds.GoTo:
                command.Finish(result.Outcome!, now, result.Reason);
                break;
            default:
                throw NotAllowed();
        }
    }

    private async Task ApplyToTourAsync(Tour tour, RobotCommand command, string robotCode, DateTimeOffset now, CancellationToken ct)
    {
        if (command.State == RobotCommandStates.Rejected)
            tour.RequireAssistance(TourRuntime.CommandRejected, now);
        else if (command.State == RobotCommandStates.Arrived && command.LegKind == RobotLegKinds.ToEnd)
            await TourLegDispatch.CompleteAsync(repository, tour, command.RobotId, null, now, ct);
        else if (command.State == RobotCommandStates.Arrived)
        {
            var stops = await revisions.GetStopsAsync(tour.RouteRevisionId!.Value, ct);
            var stop = stops.Single(item => item.Id == command.RouteRevisionStopId);
            tour.ArriveAtStop(stop.Id, now.AddSeconds(stop.DwellSeconds), now);
            // AUTO head mode does what the POI's camera preset says (in memory, best effort). Queued before the commit:
            // if the commit failed the head would still turn, which is harmless; an exact repeat never gets here.
            headMotion.QueueArrival(tour.Id, robotCode, stop.CameraPreset);
        }
        // A CANCELLED nobody asked for during a running leg needs the Operator like a failure does.
        else if (command.State is RobotCommandStates.Failed or RobotCommandStates.Cancelled)
            tour.RequireAssistance(TourRuntime.NavigationFailed, now);
    }

    private static string EventType(string phase) => phase switch
    {
        CommandResultPhases.Accepted => TourLifecycleEvents.LegAccepted,
        CommandResultPhases.Rejected => TourLifecycleEvents.LegRejected,
        _ => TourLifecycleEvents.LegTerminal
    };

    private static string Content(ReportCommandResultCommand result) => string.Join('|', result.Phase, result.Outcome, result.Reason,
        result.ReportedAt.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture));

    private static string? Stored(TourEvent recorded)
    {
        using var json = JsonDocument.Parse(recorded.DataJson!);
        return json.RootElement.GetProperty("result").GetString();
    }

    private static ConflictException NotAllowed() =>
        new("Trạng thái lệnh không cho phép kết quả này.", "RESULT_PHASE_NOT_ALLOWED");
}
