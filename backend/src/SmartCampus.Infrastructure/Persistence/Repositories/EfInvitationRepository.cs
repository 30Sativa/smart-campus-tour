using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfInvitationRepository(ApplicationDbContext context) : IInvitationRepository
{
    public async Task<IReadOnlyList<Invitation>> LoadAsync(Guid registrationId, CancellationToken ct) =>
        await context.Invitations.Include(i => i.RosterRow).ThenInclude(r => r.Registration)
            .Include(i => i.BrowserSessions).Where(i => i.RosterRow.RegistrationId == registrationId).ToArrayAsync(ct);
    public Task<Invitation?> FindInvitationAsync(Guid id, CancellationToken ct) =>
        context.Invitations.Include(i => i.RosterRow).ThenInclude(r => r.Registration)
            .SingleOrDefaultAsync(i => i.Id == id, ct);
    public void Add(Invitation invitation) => context.Invitations.Add(invitation);
    public async Task<bool> HashExistsAsync(byte[] hash, CancellationToken ct) =>
        context.Invitations.Local.Any(i => i.AccessCodeHash.AsSpan().SequenceEqual(hash)) ||
        await context.Invitations.AnyAsync(i => i.AccessCodeHash == hash, ct);
    public void AddAudit(AuditLog audit) => context.AuditLogs.Add(audit);
    public Task<AuditLog?> FindRequestAsync(Guid requestId, CancellationToken ct) =>
        context.AuditLogs.AsNoTracking().Where(a => a.CorrelationId == requestId && a.Action.StartsWith("INVITATION_"))
            .FirstOrDefaultAsync(ct);
    public Task<AuditLog?> LatestSendAsync(Guid invitationId, CancellationToken ct) =>
        context.AuditLogs.AsNoTracking().Where(a => a.EntityId == invitationId.ToString("D") && a.Action == InvitationAudit.Requested)
            .OrderByDescending(a => a.Id).FirstOrDefaultAsync(ct);
    public Task<bool> HasResultAsync(Guid attemptId, CancellationToken ct) =>
        context.AuditLogs.AnyAsync(a => a.CorrelationId == attemptId && a.Action == InvitationAudit.Result, ct);
    public Task<bool> HasStartedAsync(Guid attemptId, CancellationToken ct) =>
        context.AuditLogs.AnyAsync(a => a.CorrelationId == attemptId && a.Action == InvitationAudit.Started, ct);
    public Task<AuditLog?> GetAttemptAsync(Guid attemptId, CancellationToken ct) =>
        context.AuditLogs.AsNoTracking().SingleOrDefaultAsync(a => a.CorrelationId == attemptId && a.Action == InvitationAudit.Requested, ct);
    public async Task<IReadOnlyList<EmailWorkItem>> PendingAsync(DateTimeOffset staleBefore, CancellationToken ct) =>
        await context.AuditLogs.AsNoTracking().Where(a => a.Action == InvitationAudit.Requested &&
            !context.AuditLogs.Any(result => result.CorrelationId == a.CorrelationId && result.Action == InvitationAudit.Result) &&
            (!context.AuditLogs.Any(start => start.CorrelationId == a.CorrelationId && start.Action == InvitationAudit.Started) ||
                context.AuditLogs.Any(start => start.CorrelationId == a.CorrelationId && start.Action == InvitationAudit.Started && start.OccurredAt < staleBefore)))
            .OrderBy(a => a.Id).Take(20).Select(a => new EmailWorkItem(a.CorrelationId!.Value,
                context.AuditLogs.Any(start => start.CorrelationId == a.CorrelationId && start.Action == InvitationAudit.Started))).ToArrayAsync(ct);

    public async Task<InvitationReadModel?> ReadAsync(Guid registrationId, Guid? owner, CancellationToken ct)
    {
        var tourId = await context.GroupRegistrations.AsNoTracking()
            .Where(r => r.Id == registrationId && (owner == null || r.RepresentativeUserId == owner))
            .Select(r => (Guid?)r.TourId).SingleOrDefaultAsync(ct);
        if (tourId is null) return null;
        await using var snapshot = await RegistrationReadSnapshot.BeginAsync(context, tourId.Value, ct);
        var registration = await context.GroupRegistrations.AsNoTracking().Include(r => r.Tour).Include(r => r.RosterRows)
            .SingleAsync(r => r.Id == registrationId, ct);
        var invitations = await context.Invitations.AsNoTracking().Include(i => i.RosterRow)
            .Where(i => i.RosterRow.RegistrationId == registrationId).ToArrayAsync(ct);
        var ids = invitations.Select(i => i.Id.ToString("D")).ToArray();
        var audits = await context.AuditLogs.AsNoTracking().Where(a => a.EntityType == "Invitation" && ids.Contains(a.EntityId) &&
            (a.Action == InvitationAudit.Requested || a.Action == InvitationAudit.Result)).OrderBy(a => a.Id).ToArrayAsync(ct);
        return new(invitations, registration.Tour, registration, audits);
    }
}
