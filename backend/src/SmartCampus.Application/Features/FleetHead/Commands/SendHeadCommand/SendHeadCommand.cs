using MediatR;

namespace SmartCampus.Application.Features.FleetHead.Commands.SendHeadCommand;

// In-memory only (ADR-0045): deliberately not ICommand, so UnitOfWorkBehavior never calls SQL SaveChanges for a button press.
public sealed record SendHeadCommand(Guid TourId, Guid Actor, HeadCommandSpec Spec) : IRequest<SendHeadCommandResult>;

public sealed record SendHeadCommandResult(long Seq, string RobotCode, DateTimeOffset IssuedAt);
