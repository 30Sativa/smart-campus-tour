using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Routes.Commands.UpdateRoute;

public sealed record UpdateRouteInput(string ExpectedVersion, RouteInput Configuration);
public sealed record UpdateRouteCommand(Guid Id, Guid ActorUserId, UpdateRouteInput Input) : IRouteMutationCommand<Unit>;
