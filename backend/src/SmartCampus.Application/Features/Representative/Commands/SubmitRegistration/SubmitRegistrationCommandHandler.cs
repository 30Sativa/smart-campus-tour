using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Representative.Commands.SubmitRegistration.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Representative.Commands.SubmitRegistration;

public sealed class SubmitRegistrationCommandHandler(IRepresentativeRepository repository, TimeProvider clock)
    : IRequestHandler<SubmitRegistrationCommand, RegistrationCreated>
{
    public async Task<RegistrationCreated> Handle(SubmitRegistrationCommand command, CancellationToken ct)
    {
        var tour = await repository.LockTourAsync(command.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var replay = await repository.FindSubmissionAsync(command.ActorUserId, tour.Id, command.IdempotencyKey, ct);
        if (replay is not null) return new(replay.Value);
        RegistrationRules.CheckVersion(tour.RowVersion, command.Input.ExpectedTourRowVersion);
        RegistrationRules.RequireAllowed(tour.State, string.Empty, false, RegistrationOperation.Create);
        await RegistrationMutation.EnsureEmailsAvailableAsync(repository, tour.Id, null, command.Input.Roster, ct);
        var now = clock.GetUtcNow();
        var registration = new GroupRegistration { Id = Guid.NewGuid(), TourId = tour.Id, RepresentativeUserId = command.ActorUserId,
            State = RegistrationRules.Submitted, SubmittedAt = now, CreatedAt = now };
        RegistrationRules.Replace(registration, command.Input, now);
        repository.AddRegistration(registration);
        repository.AddAudit(RegistrationRules.Audit(registration, command.ActorUserId,
            RegistrationRules.SubmittedAuditAction, now, command.IdempotencyKey));
        return new(registration.Id);
    }
}
