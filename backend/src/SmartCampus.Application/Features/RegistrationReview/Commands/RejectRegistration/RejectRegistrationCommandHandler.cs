using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.RejectRegistration;

public sealed class RejectRegistrationCommandHandler(IRegistrationRepository repository, TimeProvider clock)
    : IRequestHandler<RejectRegistrationCommand, Unit>
{
    public async Task<Unit> Handle(RejectRegistrationCommand command, CancellationToken ct)
    {
        // No roster revalidation: rejection is how invalid stored data goes back to the Representative.
        var (_, registration) = await ReviewDecision.LockAsync(repository, command.Id, command.Request, ct);
        var now = clock.GetUtcNow();
        ReviewDecision.Record(registration, command.ActorUserId, RegistrationStates.Rejected, command.Request.Reason!.Trim(), now);
        repository.AddAudit(RegistrationAudit.Create(registration, command.ActorUserId, RegistrationAudit.RejectedAuditAction, now));
        return Unit.Value;
    }
}
