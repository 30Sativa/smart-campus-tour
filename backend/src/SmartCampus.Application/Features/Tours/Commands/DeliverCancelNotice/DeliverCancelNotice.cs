using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;

namespace SmartCampus.Application.Features.Tours.Commands.DeliverCancelNotice;

public sealed record TourCancelNoticeFailure(Guid RegistrationId, string Status, string Code);
public sealed record ClaimTourCancelNoticeCommand(Guid AttemptId, bool Interrupted) : IRegistrationMutationCommand<IReadOnlyList<TourCancelEmail>>;
public sealed record RecordTourCancelNoticeResultCommand(Guid AttemptId, int SentCount, IReadOnlyList<TourCancelNoticeFailure> Failures)
    : IRegistrationMutationCommand<Unit>;

public sealed class ClaimTourCancelNoticeCommandHandler(IInvitationRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<ClaimTourCancelNoticeCommand, IReadOnlyList<TourCancelEmail>>
{
    public async Task<IReadOnlyList<TourCancelEmail>> Handle(ClaimTourCancelNoticeCommand command, CancellationToken ct)
    {
        var request = await repository.GetTourCancelNoticeAsync(command.AttemptId, ct);
        if (request is null) return [];
        var tour = await registrations.LockTourAsync(request.TourId!.Value, ct);
        if (tour is null || await repository.HasTourCancelNoticeResultAsync(command.AttemptId, ct)) return [];
        var started = await repository.HasTourCancelNoticeStartedAsync(command.AttemptId, ct);
        var ids = TourCancelNoticeAudit.RegistrationIds(request);
        var now = clock.GetUtcNow();
        if (command.Interrupted)
        {
            // Some of the batch may already be out, so it is reported and never sent twice.
            if (started) repository.AddAudit(TourCancelNoticeAudit.Create(tour.Id, request.ActorUserId, TourCancelNoticeAudit.Failed,
                command.AttemptId, now, "UNKNOWN", new { code = "INTERRUPTED", recipientCount = ids.Length }));
            return [];
        }
        if (started) return [];
        repository.AddAudit(TourCancelNoticeAudit.Create(tour.Id, request.ActorUserId, TourCancelNoticeAudit.Started, command.AttemptId, now, "PENDING"));
        // A representative with several groups under one contact address gets one email.
        return (await repository.LoadTourCancelRecipientsAsync(ids, ct))
            .DistinctBy(recipient => recipient.Email.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(recipient => new TourCancelEmail(tour.Id, command.AttemptId, recipient.RegistrationId, recipient.Email.Trim(),
                tour.Name, tour.ScheduledStartAt, tour.EndReason ?? "")).ToArray();
    }
}

public sealed class RecordTourCancelNoticeResultCommandHandler(IInvitationRepository repository, IRegistrationRepository registrations, TimeProvider clock)
    : IRequestHandler<RecordTourCancelNoticeResultCommand, Unit>
{
    public async Task<Unit> Handle(RecordTourCancelNoticeResultCommand command, CancellationToken ct)
    {
        var request = await repository.GetTourCancelNoticeAsync(command.AttemptId, ct);
        if (request is null) return Unit.Value;
        var tourId = request.TourId!.Value;
        _ = await registrations.LockTourAsync(tourId, ct);
        if (await repository.HasTourCancelNoticeResultAsync(command.AttemptId, ct)) return Unit.Value;
        var now = clock.GetUtcNow();
        if (command.SentCount > 0)
            repository.AddAudit(TourCancelNoticeAudit.Create(tourId, request.ActorUserId, TourCancelNoticeAudit.Sent, command.AttemptId, now,
                "ACCEPTED", new { recipientCount = command.SentCount }));
        foreach (var failure in command.Failures)
            repository.AddAudit(TourCancelNoticeAudit.Create(tourId, request.ActorUserId, TourCancelNoticeAudit.Failed, command.AttemptId, now,
                failure.Status, new { code = failure.Code }, "GroupRegistration", failure.RegistrationId.ToString("D")));
        return Unit.Value;
    }
}
