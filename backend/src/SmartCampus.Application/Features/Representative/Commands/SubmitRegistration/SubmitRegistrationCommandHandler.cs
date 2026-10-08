using SmartCampus.Application.Features.Representative.Commands.RegistrationDraft;
using SmartCampus.Application.Features.Representative.Commands;
using SmartCampus.Application.Features.Registrations;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Representative.Commands.SubmitRegistration.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Representative.Commands.SubmitRegistration;

public sealed class SubmitRegistrationCommandHandler(IRegistrationRepository repository, TimeProvider clock)
    : IRequestHandler<SubmitRegistrationCommand, RegistrationCreated>
{
    public async Task<RegistrationCreated> Handle(SubmitRegistrationCommand command, CancellationToken ct)
    {
        var tour = await repository.LockTourAsync(command.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        var replay = await repository.FindSubmissionAsync(command.ActorUserId, tour.Id, command.IdempotencyKey, ct);
        if (replay is not null) return new(replay.Value);
        RegistrationConsistency.CheckVersion(tour.RowVersion, command.Input.ExpectedTourRowVersion);
        RepresentativeRegistrationPolicy.RequireAllowed(tour.State, string.Empty, false, RegistrationOperation.Create);
        await RegistrationEmailReservation.EnsureAvailableAsync(repository, tour.Id, null, command.Input.Roster, ct);
        var now = clock.GetUtcNow();
        var registration = new GroupRegistration { Id = Guid.NewGuid(), TourId = tour.Id, RepresentativeUserId = command.ActorUserId,
            State = RegistrationConsistency.Submitted, SubmittedAt = now, CreatedAt = now };
        RegistrationDraftWriter.Replace(registration, command.Input, now);
        repository.AddRegistration(registration);
        repository.AddAudit(RegistrationAudit.Create(registration, command.ActorUserId,
            RegistrationAudit.SubmittedAuditAction, now, command.IdempotencyKey));
        return new(registration.Id);
    }
}
