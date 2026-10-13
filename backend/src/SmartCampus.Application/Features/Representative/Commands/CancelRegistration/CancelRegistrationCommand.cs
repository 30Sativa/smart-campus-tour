using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Representative.Commands.CancelRegistration.Dtos;

namespace SmartCampus.Application.Features.Representative.Commands.CancelRegistration;

public sealed record CancelRegistrationCommand(Guid Id, Guid ActorUserId, CancelRegistrationRequest Request)
    : IRegistrationMutationCommand<Unit>;
