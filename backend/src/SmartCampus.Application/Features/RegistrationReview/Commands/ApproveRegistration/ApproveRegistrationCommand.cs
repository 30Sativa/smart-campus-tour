using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.ApproveRegistration;

public sealed record ApproveRegistrationCommand(Guid Id, Guid ActorUserId, ReviewRequest Request)
    : IRegistrationMutationCommand<Unit>;
