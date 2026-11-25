using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Invitations.Commands.DeliverEmail;

namespace SmartCampus.Api.Invitations;

/// <summary>Sends committed "code revoked" notices. Same shape as invitation delivery: claim, send outside SQL, record in a fresh scope.</summary>
public sealed class InvitationRevokeNoticeDispatcher(IServiceScopeFactory scopes, TimeProvider clock, ILogger<InvitationRevokeNoticeDispatcher> logger)
{
    private static readonly TimeSpan ClaimStaleAfter = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan PauseBetweenSends = TimeSpan.FromMilliseconds(600);

    public async Task DispatchPendingAsync(CancellationToken ct)
    {
        await using var scan = scopes.CreateAsyncScope();
        var pending = await scan.ServiceProvider.GetRequiredService<IInvitationRepository>()
            .PendingRevokeNoticesAsync(clock.GetUtcNow() - ClaimStaleAfter, ct);
        foreach (var work in pending)
        {
            await using var scope = scopes.CreateAsyncScope();
            var email = await scope.ServiceProvider.GetRequiredService<ISender>().Send(new ClaimRevokeNoticeCommand(work.AttemptId, work.Interrupted), ct);
            if (email is null) continue;
            EmailSendResult result;
            try { result = await scope.ServiceProvider.GetRequiredService<IInvitationEmailSender>().SendInvitationRevokedAsync(email, ct); }
            catch (Exception) { result = new("UNKNOWN", "DELIVERY_UNCERTAIN"); }
            if (result.Status != "ACCEPTED")
                logger.LogWarning("Invitation revoke notice {AttemptId} recorded {Status} ({Code}).", work.AttemptId, result.Status, result.Code);
            // Result recording gets its own scope so a failed save cannot reuse a poisoned tracker.
            await using var recording = scopes.CreateAsyncScope();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await recording.ServiceProvider.GetRequiredService<ISender>()
                .Send(new RecordRevokeNoticeResultCommand(work.AttemptId, result.Status, result.Code), timeout.Token);
            await Task.Delay(PauseBetweenSends, ct);
        }
    }
}
