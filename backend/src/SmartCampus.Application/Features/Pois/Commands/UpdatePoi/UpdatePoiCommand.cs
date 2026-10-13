using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Pois.Dtos;
using MediatR;

namespace SmartCampus.Application.Features.Pois.Commands.UpdatePoi;

public sealed record UpdatePoiCommand(Guid Id, Guid ActorUserId, UpdatePoiRequest Request)
    : IPoiMutationCommand<Unit>;
