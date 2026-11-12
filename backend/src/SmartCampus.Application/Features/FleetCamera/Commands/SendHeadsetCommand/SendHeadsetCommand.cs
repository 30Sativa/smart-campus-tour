using MediatR;

namespace SmartCampus.Application.Features.FleetCamera.Commands.SendHeadsetCommand;

// In memory only (ADR-0056 addendum): plain IRequest, so a button press never reaches UnitOfWorkBehavior or SQL.
// Action is WAKE or SLEEP.
public sealed record SendHeadsetCommand(string RobotCode, string Action) : IRequest<SendHeadsetCommandResult>;

/// <summary>The queued press: the robot receives it with its next camera poll, if that comes before <see cref="ExpiresAt"/>.</summary>
public sealed record SendHeadsetCommandResult(string RobotCode, Guid CommandId, string Action, DateTimeOffset ExpiresAt);
