using MediatR;

namespace SmartCampus.Application.Features.FleetCamera.Commands.PollCameraDemand;

// Transient, like Fleet Head: deliberately not ICommand, so UnitOfWorkBehavior never calls SQL SaveChanges.
public sealed record PollCameraDemand(string RobotCode) : IRequest<CameraDemand>;
