using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail;

public sealed record CorrectRosterEmailCommand(Guid RegistrationId, Guid RosterRowId, Guid ActorUserId,
    CorrectRosterEmailRequest Request) : IRegistrationMutationCommand<Unit>;
