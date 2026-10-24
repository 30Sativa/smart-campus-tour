using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Commands.RegistrationDraft;

namespace SmartCampus.Application.Features.Representative.Commands.UpdateRegistration;

public sealed class UpdateRegistrationCommandHandler(IRegistrationRepository repository, TimeProvider clock)
    : IRequestHandler<UpdateRegistrationCommand, Unit>
{
    public async Task<Unit> Handle(UpdateRegistrationCommand command, CancellationToken ct)
    {
        var input = command.Request.Input;
        var (tour, registration) = await RegistrationMutation.LoadAsync(repository, command.Id, command.ActorUserId,
            command.Request.ExpectedRowVersion, input.ExpectedTourRowVersion, RegistrationOperation.Update, ct);
        await RegistrationEmailReservation.EnsureAvailableAsync(repository, tour.Id, registration.Id, input.Roster, ct);
        var now = clock.GetUtcNow();
        RegistrationDraftWriter.Replace(registration, input, now);
        repository.AddAudit(RegistrationAudit.Create(registration, command.ActorUserId, RegistrationAudit.UpdatedAuditAction, now));
        return Unit.Value;
    }
}
