using MediatR;

namespace SmartCampus.Application.Features.FleetCamera.Commands.LeaseCamera;

// In memory only (ADR-0052): not ICommand, so no SQL commit runs for a renewal. StaffUserId names the holder of the
// relay token that comes back with the lease (ADR-0055).
public sealed record LeaseCamera(string RobotCode, Guid? StaffUserId = null) : IRequest<RobotCameraStatus>;
