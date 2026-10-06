using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Representative.Dtos;

namespace SmartCampus.Application.Features.Representative.Commands.ResubmitRegistration;

public sealed record ResubmitRegistrationCommand(Guid Id, Guid ActorUserId, ReplaceRegistrationRequest Request)
    : IRegistrationMutationCommand<Unit>;
