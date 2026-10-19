using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Routes.Commands.DeleteRoute;

public sealed record DeleteRouteCommand(Guid Id, Guid ActorUserId, string ExpectedVersion) : IRouteMutationCommand<Unit>;
