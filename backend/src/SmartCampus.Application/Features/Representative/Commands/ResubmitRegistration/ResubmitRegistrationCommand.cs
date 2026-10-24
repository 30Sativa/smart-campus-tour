using SmartCampus.Application.Features.Representative.Commands.RegistrationDraft;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Representative.Commands.ResubmitRegistration;

public sealed record ResubmitRegistrationCommand(Guid Id, Guid ActorUserId, ReplaceRegistrationRequest Request)
    : IRegistrationMutationCommand<Unit>;
