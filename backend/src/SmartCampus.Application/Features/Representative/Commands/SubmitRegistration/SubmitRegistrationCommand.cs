using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Representative.Commands.SubmitRegistration.Dtos;

namespace SmartCampus.Application.Features.Representative.Commands.SubmitRegistration;

public sealed record SubmitRegistrationCommand(Guid TourId, Guid ActorUserId, Guid IdempotencyKey, RegistrationInput Input)
    : IRegistrationMutationCommand<RegistrationCreated>;
