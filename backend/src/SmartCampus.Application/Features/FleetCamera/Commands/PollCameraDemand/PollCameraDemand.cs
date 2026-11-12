using MediatR;

namespace SmartCampus.Application.Features.FleetCamera.Commands.PollCameraDemand;

// Transient, like Fleet Head: deliberately not ICommand, so UnitOfWorkBehavior never calls SQL SaveChanges.
// Headset (ADR-0056) is optional: an older quest-stream sends no body.
public sealed record PollCameraDemand(string RobotCode, HeadsetReport? Headset = null) : IRequest<CameraDemand>;
