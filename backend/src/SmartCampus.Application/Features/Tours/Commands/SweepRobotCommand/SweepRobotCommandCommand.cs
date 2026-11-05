using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Commands.SweepRobotCommand;

/// <summary>Open commands that look due, unlocked. Each is decided again under its locks, so a stale answer does nothing.</summary>
public sealed record ListDueRobotCommandsQuery : IQuery<IReadOnlyList<Guid>>;

/// <summary>One transition in its own transaction. Safe to rerun and to run from two sweepers at once: the rule is decided under the locks.</summary>
public sealed record SweepRobotCommandCommand(Guid CommandId) : ITourMutationCommand<bool>;

public sealed class ListDueRobotCommandsQueryHandler(ITourManagementRepository repository, IRouteRevisionRepository revisions,
    IFleetTelemetryStore telemetry, FleetCommandSettings settings, TimeProvider clock)
    : IRequestHandler<ListDueRobotCommandsQuery, IReadOnlyList<Guid>>
{
    public async Task<IReadOnlyList<Guid>> Handle(ListDueRobotCommandsQuery query, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var due = new List<Guid>();
        foreach (var command in await repository.ListOpenCommandsAsync(ct))
        {
            var snapshot = RobotTelemetry.Latest(telemetry, await revisions.GetRobotCodeAsync(command.RobotId, ct));
            if (RobotCommandTimeouts.Decide(command, snapshot?.Report.StreamId, now, settings) is not null) due.Add(command.Id);
        }
        return due;
    }
}

public sealed class SweepRobotCommandCommandHandler(ITourManagementRepository repository, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, IFleetTelemetryStore telemetry, FleetCommandSettings settings, TimeProvider clock)
    : IRequestHandler<SweepRobotCommandCommand, bool>
{
    public async Task<bool> Handle(SweepRobotCommandCommand sweep, CancellationToken ct)
    {
        if (await repository.FindCommandAsync(sweep.CommandId, ct) is not { } known) return false;
        if (await registrations.LockTourAsync(known.TourId, ct) is not { } tour) return false;
        if (await repository.LockCommandAsync(sweep.CommandId, ct) is not { } command) return false;

        var now = clock.GetUtcNow();
        var snapshot = RobotTelemetry.Latest(telemetry, await revisions.GetRobotCodeAsync(command.RobotId, ct));
        if (RobotCommandTimeouts.Decide(command, snapshot?.Report.StreamId, now, settings) is not { } timeout) return false;
        var fresh = snapshot is not null && now - snapshot.ReceivedAt <= settings.MaxTelemetryAge;
        RobotCommandTimeouts.Apply(repository, tour, command, timeout, fresh, now);
        return true;
    }
}

internal static class RobotTelemetry
{
    public static FleetTelemetrySnapshot? Latest(IFleetTelemetryStore telemetry, string? robotCode) =>
        telemetry.GetLatest().FirstOrDefault(item => string.Equals(item.Robot.RobotCode, robotCode, StringComparison.Ordinal));
}
