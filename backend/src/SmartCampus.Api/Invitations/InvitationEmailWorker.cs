using MediatR;
using System.Diagnostics;
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
            Guid? currentAttempt = null;
            try
            {
                await using var scan = scopes.CreateAsyncScope();
                var pending = await scan.ServiceProvider.GetRequiredService<IInvitationRepository>()
                    .PendingAsync(clock.GetUtcNow().AddMinutes(-2), stoppingToken);
                foreach (var work in pending)
                {
                    currentAttempt = work.AttemptId;
                    using var logScope = logger.BeginScope(new Dictionary<string, object> { ["AttemptId"] = work.AttemptId });
                    var began = Stopwatch.GetTimestamp();
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
                        logger.LogInformation("Invitation attempt {AttemptId} recorded {Status} after {ElapsedMs} ms.",
                            work.AttemptId, result.Status, Stopwatch.GetElapsedTime(began).TotalMilliseconds);
                        await Task.Delay(600, stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogWarning("Invitation scan/attempt {AttemptId} failed ({ErrorType}); pending requests remain persisted.", currentAttempt, error.GetType().Name); }
            try { await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
