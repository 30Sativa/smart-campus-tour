using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Invitations.Commands.DeliverEmail;

namespace SmartCampus.Api.Invitations;

public sealed class InvitationEmailWorker(IServiceScopeFactory scopes, InvitationSettings settings, TimeProvider clock,
    ILogger<InvitationEmailWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!settings.Enabled) return;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scan = scopes.CreateAsyncScope();
                var pending = await scan.ServiceProvider.GetRequiredService<IInvitationRepository>()
                    .PendingAsync(clock.GetUtcNow().AddMinutes(-2), stoppingToken);
                foreach (var work in pending)
                {
                    await using var scope = scopes.CreateAsyncScope();
                    var sender = scope.ServiceProvider.GetRequiredService<ISender>();
                    var email = await sender.Send(new ClaimEmailCommand(work.AttemptId, work.Interrupted), stoppingToken);
                    if (email is not null)
                    {
                        EmailSendResult result;
                        try { result = await scope.ServiceProvider.GetRequiredService<IInvitationEmailSender>().SendAsync(email, stoppingToken); }
                        catch (Exception) { result = new("UNKNOWN", "DELIVERY_UNCERTAIN"); }
                        // Result recording gets its own scope so a failed save cannot reuse a poisoned tracker.
                        await using var recording = scopes.CreateAsyncScope();
                        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
                        await recording.ServiceProvider.GetRequiredService<ISender>()
                            .Send(new RecordEmailResultCommand(work.AttemptId, result.Status, result.Code), timeout.Token);
                        await Task.Delay(600, stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception) { logger.LogWarning("Invitation delivery scan failed; pending requests remain persisted."); }
            try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
