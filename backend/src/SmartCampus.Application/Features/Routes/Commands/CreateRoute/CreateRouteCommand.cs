using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Routes.Commands.CreateRoute;

public sealed record CreateRouteCommand(Guid ActorUserId, RouteInput Input) : IRouteMutationCommand<CreateRouteResult>;
public sealed record CreateRouteResult(Guid Id);
