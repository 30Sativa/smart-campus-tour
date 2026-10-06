using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Representative.Commands.UpdateRegistration;

public sealed class UpdateRegistrationCommandHandler(IRepresentativeRepository repository, TimeProvider clock)
    : IRequestHandler<UpdateRegistrationCommand, Unit>
{
    public async Task<Unit> Handle(UpdateRegistrationCommand command, CancellationToken ct)
    {
        var input = command.Request.Input;
        var (tour, registration) = await RegistrationMutation.LoadAsync(repository, command.Id, command.ActorUserId,
            command.Request.ExpectedRowVersion, input.ExpectedTourRowVersion, RegistrationOperation.Update, ct);
        await RegistrationMutation.EnsureEmailsAvailableAsync(repository, tour.Id, registration.Id, input.Roster, ct);
        var now = clock.GetUtcNow();
        RegistrationRules.Replace(registration, input, now);
        repository.AddAudit(RegistrationRules.Audit(registration, command.ActorUserId, RegistrationRules.UpdatedAuditAction, now));
        return Unit.Value;
    }
}
