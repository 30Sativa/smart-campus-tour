using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Representative.Commands.ResubmitRegistration;

public sealed class ResubmitRegistrationCommandHandler(IRepresentativeRepository repository, TimeProvider clock)
    : IRequestHandler<ResubmitRegistrationCommand, Unit>
{
    public async Task<Unit> Handle(ResubmitRegistrationCommand command, CancellationToken ct)
    {
        var input = command.Request.Input;
        var (tour, registration) = await RegistrationMutation.LoadAsync(repository, command.Id, command.ActorUserId,
            command.Request.ExpectedRowVersion, input.ExpectedTourRowVersion, RegistrationOperation.Resubmit, ct);
        await RegistrationMutation.EnsureEmailsAvailableAsync(repository, tour.Id, registration.Id, input.Roster, ct);
        var now = clock.GetUtcNow();
        RegistrationRules.Replace(registration, input, now);
        registration.State = RegistrationRules.Submitted;
        registration.SubmittedAt = now;
        registration.CancelledAt = null;
        registration.ReviewedAt = null;
        registration.ReviewedByUserId = null;
        registration.RejectionReason = null;
        repository.AddAudit(RegistrationRules.Audit(registration, command.ActorUserId, RegistrationRules.ResubmittedAuditAction, now));
        return Unit.Value;
    }
}
