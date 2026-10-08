using SmartCampus.Application.Features.Representative.Commands;
using SmartCampus.Application.Features.Registrations;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Representative.Commands.CancelRegistration;

public sealed class CancelRegistrationCommandHandler(IRegistrationRepository repository, TimeProvider clock)
    : IRequestHandler<CancelRegistrationCommand, Unit>
{
    public async Task<Unit> Handle(CancelRegistrationCommand command, CancellationToken ct)
    {
        var (_, registration) = await RegistrationMutation.LoadAsync(repository, command.Id, command.ActorUserId,
            command.Request.ExpectedRowVersion, command.Request.ExpectedTourRowVersion, RegistrationOperation.Cancel, ct);
        var now = clock.GetUtcNow();
        registration.State = "CANCELLED";
        registration.CancelledAt = now;
        registration.UpdatedAt = now;
        repository.AddAudit(RegistrationAudit.Create(registration, command.ActorUserId, RegistrationAudit.CancelledAuditAction, now));
        return Unit.Value;
    }
}
