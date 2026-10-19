using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Routes.Commands.SetRouteAvailability;

public sealed record SetRouteAvailabilityCommand(Guid Id, Guid ActorUserId, string ExpectedVersion, bool IsActive)
    : IRouteMutationCommand<Unit>;
