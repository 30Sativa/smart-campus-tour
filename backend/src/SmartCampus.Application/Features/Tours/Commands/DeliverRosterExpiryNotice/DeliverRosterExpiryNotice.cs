using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.Tours.Commands.DeliverRosterExpiryNotice;

public sealed record RosterExpiryNoticeFailure(Guid RegistrationId, string Status, string Code);
public sealed record ClaimRosterExpiryNoticeCommand(Guid AttemptId, bool Interrupted) : IRegistrationMutationCommand<IReadOnlyList<RosterExpiredEmail>>;
public sealed record RecordRosterExpiryNoticeResultCommand(Guid AttemptId, int SentCount, IReadOnlyList<RosterExpiryNoticeFailure> Failures)
    : IRegistrationMutationCommand<Unit>;

public sealed class ClaimRosterExpiryNoticeCommandHandler(IInvitationRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<ClaimRosterExpiryNoticeCommand, IReadOnlyList<RosterExpiredEmail>>
{
    public async Task<IReadOnlyList<RosterExpiredEmail>> Handle(ClaimRosterExpiryNoticeCommand command, CancellationToken ct)
    {
        var request = await repository.GetRosterExpiryNoticeAsync(command.AttemptId, ct);
        if (request is null) return [];
        var tour = await registrations.LockTourAsync(request.TourId!.Value, ct);
        if (tour is null || await repository.HasRosterExpiryNoticeResultAsync(command.AttemptId, ct)) return [];
        var started = await repository.HasRosterExpiryNoticeStartedAsync(command.AttemptId, ct);
        var items = RosterExpiryNoticeAudit.Items(request);
        var now = clock.GetUtcNow();
        if (command.Interrupted)
        {
            // Some of the batch may already be out, so it is reported and never sent twice.
            if (started) repository.AddAudit(TourCancelNoticeAudit.Create(tour.Id, null, RosterExpiryNoticeAudit.Failed,
                command.AttemptId, now, "UNKNOWN", new { code = "INTERRUPTED", recipientCount = items.Length }));
            return [];
        }
        if (started) return [];
        repository.AddAudit(TourCancelNoticeAudit.Create(tour.Id, null, RosterExpiryNoticeAudit.Started, command.AttemptId, now, "PENDING"));
        var byRegistration = items.ToDictionary(item => item.RegistrationId);
        return (await repository.LoadTourCancelRecipientsAsync(byRegistration.Keys, ct))
            .Select(recipient => new RosterExpiredEmail(tour.Id, command.AttemptId, recipient.RegistrationId, recipient.Email.Trim(), tour.Name,
                tour.ScheduledStartAt, byRegistration[recipient.RegistrationId].ExpiredRows, byRegistration[recipient.RegistrationId].ExpiredEmailChanges))
            .ToArray();
    }
}

public sealed class RecordRosterExpiryNoticeResultCommandHandler(IInvitationRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<RecordRosterExpiryNoticeResultCommand, Unit>
{
    public async Task<Unit> Handle(RecordRosterExpiryNoticeResultCommand command, CancellationToken ct)
    {
        var request = await repository.GetRosterExpiryNoticeAsync(command.AttemptId, ct);
        if (request is null) return Unit.Value;
        var tourId = request.TourId!.Value;
        _ = await registrations.LockTourAsync(tourId, ct);
        if (await repository.HasRosterExpiryNoticeResultAsync(command.AttemptId, ct)) return Unit.Value;
        var now = clock.GetUtcNow();
        if (command.SentCount > 0)
            repository.AddAudit(TourCancelNoticeAudit.Create(tourId, null, RosterExpiryNoticeAudit.Sent, command.AttemptId, now,
                "ACCEPTED", new { recipientCount = command.SentCount }));
        foreach (var failure in command.Failures)
            repository.AddAudit(TourCancelNoticeAudit.Create(tourId, null, RosterExpiryNoticeAudit.Failed, command.AttemptId, now,
                failure.Status, new { code = failure.Code }, "GroupRegistration", failure.RegistrationId.ToString("D")));
        return Unit.Value;
    }
}
