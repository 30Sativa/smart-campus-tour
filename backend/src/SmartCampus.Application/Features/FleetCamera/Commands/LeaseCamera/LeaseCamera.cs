using MediatR;

namespace SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;

// In memory only (ADR-0052): not ICommand, so no SQL commit runs for a renewal.
public sealed record LeaseCamera(string RobotCode) : IRequest<RobotCameraStatus>;
