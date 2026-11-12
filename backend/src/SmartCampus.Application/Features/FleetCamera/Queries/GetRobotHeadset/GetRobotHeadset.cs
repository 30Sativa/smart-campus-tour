using MediatR;

namespace SmartCampus.Application.Features.FleetCamera.Queries.GetRobotHeadset;

// In memory only (ADR-0056): plain IRequest, no SQL write.
public sealed record GetRobotHeadset(string RobotCode) : IRequest<RobotHeadsetStatus>;
