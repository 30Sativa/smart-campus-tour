using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Pois.Commands.SetPoiAvailability;

public sealed record SetPoiAvailabilityCommand(
    Guid Id,
    Guid ActorUserId,
    string ExpectedRowVersion,
    bool IsActive) : IPoiMutationCommand<Unit>;
