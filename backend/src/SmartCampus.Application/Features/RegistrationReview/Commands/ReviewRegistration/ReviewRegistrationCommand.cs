using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.ReviewRegistration;

public sealed record ReviewRegistrationCommand(Guid Id, Guid ActorUserId, bool Approve, ReviewRequest Request)
    : IRegistrationMutationCommand<Unit>;
