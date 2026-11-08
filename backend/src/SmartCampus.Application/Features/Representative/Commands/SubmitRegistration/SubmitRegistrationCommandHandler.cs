using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Commands.RegistrationDraft;
using SmartCampus.Application.Features.Representative.Commands.SubmitRegistration.Dtos;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Representative.Commands.SubmitRegistration;

public sealed class SubmitRegistrationCommandHandler(IRegistrationRepository repository, TimeProvider clock)
    : IRequestHandler<SubmitRegistrationCommand, RegistrationCreated>
{
    public async Task<RegistrationCreated> Handle(SubmitRegistrationCommand command, CancellationToken ct)
    {
        var tour = await repository.LockTourAsync(command.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        // A committed key replays its original ID under the same Tour lock, even after later state changes.
        var replay = await repository.FindSubmissionAsync(command.ActorUserId, tour.Id, command.IdempotencyKey, ct);
        if (replay is not null) return new(replay.Value);
        RowVersionToken.EnsureCurrent(tour.RowVersion, command.Input.ExpectedTourRowVersion);
        RepresentativeRegistrationPolicy.Evaluate(tour.State, string.Empty, false, RegistrationOperation.Create).EnsureAllowed();
        var now = clock.GetUtcNow();
        RegistrationCutoff.EnsureNewRowsAllowed(tour, now);
        if (await repository.HasRegistrationForRepresentativeTourAsync(command.ActorUserId, tour.Id, ct))
            throw new ConflictException("Đã tồn tại hồ sơ của bạn cho Tour này.", "REGISTRATION_EXISTS");
        await RegistrationEmailReservation.EnsureAvailableAsync(repository, tour.Id, null, command.Input.Roster, ct);
        TourCapacity.EnsureRoom(tour, await repository.CountHeldSeatsAsync(tour.Id, null, ct), 0, command.Input.Roster.Count);
        var registration = new GroupRegistration { Id = Guid.NewGuid(), TourId = tour.Id, RepresentativeUserId = command.ActorUserId,
            State = RegistrationStates.Submitted, SubmittedAt = now, CreatedAt = now };
        _ = RegistrationDraftWriter.Apply(registration, command.Input, [], now);
        repository.AddRegistration(registration);
        repository.AddAudit(RegistrationAudit.Create(registration, command.ActorUserId,
            RegistrationAudit.SubmittedAuditAction, now, command.IdempotencyKey));
        return new(registration.Id);
    }
}
