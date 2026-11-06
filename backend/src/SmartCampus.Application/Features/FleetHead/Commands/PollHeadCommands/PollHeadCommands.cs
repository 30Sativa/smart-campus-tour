using MediatR;

namespace SmartCampus.Application.Features.FleetHead.Commands.PollHeadCommands;

// Transient, like Fleet Sync telemetry: deliberately not ICommand, so UnitOfWorkBehavior never calls SQL SaveChanges.
public sealed record PollHeadCommands(string RobotCode, Guid? Epoch, long AfterSeq, int WaitMs, HeadStateReport? Head)
    : IRequest<HeadPollBatch>;
