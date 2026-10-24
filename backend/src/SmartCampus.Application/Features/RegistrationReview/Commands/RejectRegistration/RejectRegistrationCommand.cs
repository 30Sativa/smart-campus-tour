using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.RejectRegistration;

public sealed record RejectRegistrationCommand(Guid Id, Guid ActorUserId, ReviewRequest Request)
    : IRegistrationMutationCommand<Unit>;
