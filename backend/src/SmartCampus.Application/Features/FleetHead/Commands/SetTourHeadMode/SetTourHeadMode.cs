using MediatR;

namespace SmartCampus.Application.Features.FleetHead.Commands.SetTourHeadMode;

// In memory only (like the head buttons): deliberately not ICommand, so no SQL save.
public sealed record SetTourHeadMode(Guid TourId, Guid Actor, string Mode) : IRequest<TourHeadModeResult>;

public sealed record TourHeadModeResult(Guid TourId, string Mode);
