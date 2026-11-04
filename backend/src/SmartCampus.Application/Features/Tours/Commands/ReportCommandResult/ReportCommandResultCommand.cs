using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.ReportCommandResult;

/// <summary>One result of docs/contracts/fleet-commands/v1; <paramref name="RobotCode"/> comes from robot authentication.</summary>
public sealed record ReportCommandResultCommand(string RobotCode, Guid CommandId, Guid LegId, Guid StreamId, string Phase,
    string? Outcome, string? Reason, DateTimeOffset ReportedAt) : ITourMutationCommand<CommandResultAck>;

public sealed record CommandResultAck(bool Accepted, bool Duplicate, string CommandState);

public static class CommandResultPhases
{
    public const string Accepted = "ACCEPTED";
    public const string Rejected = "REJECTED";
    public const string Terminal = "TERMINAL";
}
