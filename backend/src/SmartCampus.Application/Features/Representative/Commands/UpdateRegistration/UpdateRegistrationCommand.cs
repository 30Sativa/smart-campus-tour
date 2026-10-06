using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Representative.Dtos;

namespace SmartCampus.Application.Features.Representative.Commands.UpdateRegistration;

public sealed record UpdateRegistrationCommand(Guid Id, Guid ActorUserId, ReplaceRegistrationRequest Request)
    : IRegistrationMutationCommand<Unit>;
