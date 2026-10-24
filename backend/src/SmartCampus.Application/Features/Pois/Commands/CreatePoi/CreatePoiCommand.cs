using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Pois.Dtos;

namespace SmartCampus.Application.Features.Pois.Commands.CreatePoi;

public sealed record CreatePoiCommand(Guid ActorUserId, CreatePoiRequest Request)
    : IPoiMutationCommand<CreatePoiResponse>;
