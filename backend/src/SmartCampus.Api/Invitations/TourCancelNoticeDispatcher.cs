using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Tours.Commands.DeliverCancelNotice;

namespace SmartCampus.Api.Invitations;

/// <summary>Sends committed cancellation notices. Same shape as invitation delivery: claim, send outside SQL, record in a fresh scope.</summary>
public sealed class TourCancelNoticeDispatcher(IServiceScopeFactory scopes, TimeProvider clock, ILogger<TourCancelNoticeDispatcher> logger)
{
    private static readonly TimeSpan ClaimStaleAfter = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan PauseBetweenSends = TimeSpan.FromMilliseconds(600);

    public async Task DispatchPendingAsync(CancellationToken ct)
    {
        await using var scan = scopes.CreateAsyncScope();
        var pending = await scan.ServiceProvider.GetRequiredService<IInvitationRepository>()
            .PendingTourCancelNoticesAsync(clock.GetUtcNow() - ClaimStaleAfter, ct);
        foreach (var work in pending)
        {
            await using var scope = scopes.CreateAsyncScope();
            var emails = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new ClaimTourCancelNoticeCommand(work.AttemptId, work.Interrupted), ct);
            if (emails.Count == 0) continue;
            var sender = scope.ServiceProvider.GetRequiredService<IInvitationEmailSender>();
            var sent = 0;
            var failures = new List<TourCancelNoticeFailure>();
            foreach (var email in emails)
            {
                EmailSendResult result;
                try { result = await sender.SendTourCancelledAsync(email, ct); }
                catch (Exception) { result = new("UNKNOWN", "DELIVERY_UNCERTAIN"); }
                if (result.Status == "ACCEPTED") sent++;
                else
                {
                    failures.Add(new(email.RegistrationId, result.Status, result.Code));
                    logger.LogWarning("Tour cancel notice {AttemptId} for registration {RegistrationId} recorded {Status} ({Code}).",
                        work.AttemptId, email.RegistrationId, result.Status, result.Code);
                }
                await Task.Delay(PauseBetweenSends, ct);
            }
            await using var recording = scopes.CreateAsyncScope();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await recording.ServiceProvider.GetRequiredService<ISender>()
                .Send(new RecordTourCancelNoticeResultCommand(work.AttemptId, sent, failures), timeout.Token);
        }
    }
}
