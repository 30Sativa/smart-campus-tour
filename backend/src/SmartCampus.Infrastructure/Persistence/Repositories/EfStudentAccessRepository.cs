using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;
namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfStudentAccessRepository(ApplicationDbContext context) : IStudentAccessRepository
{
    public Task<Guid?> FindInvitationIdAsync(Guid tourId, byte[] codeHash, CancellationToken ct) =>
        context.Invitations.AsNoTracking().Where(i => i.RosterRow.Registration.TourId == tourId && i.AccessCodeHash == codeHash)
            .Select(i => (Guid?)i.Id).SingleOrDefaultAsync(ct);
    public Task<Guid?> FindSessionInvitationIdAsync(Guid tourId, byte[] tokenHash, CancellationToken ct) =>
        context.BrowserSessions.AsNoTracking().Where(s => s.Invitation.RosterRow.Registration.TourId == tourId && s.SessionTokenHash == tokenHash)
            .Select(s => (Guid?)s.InvitationId).SingleOrDefaultAsync(ct);
    public Task<Invitation?> LoadAsync(Guid invitationId, CancellationToken ct) =>
        context.Invitations.Include(i => i.RosterRow).ThenInclude(r => r.Registration).Include(i => i.BrowserSessions)
            .SingleOrDefaultAsync(i => i.Id == invitationId, ct);
    public void Add(BrowserSession session) => context.BrowserSessions.Add(session);
    public Task<bool> HasEnteredAsync(Guid invitationId, CancellationToken ct) => context.AuditLogs
        .AnyAsync(a => a.Action == "INVITATION_ENTERED" && a.EntityId == invitationId.ToString("D") && a.EntityType == "Invitation", ct);
    public void AddAudit(AuditLog audit) => context.AuditLogs.Add(audit);
    // Close before INSERT to respect the filtered UNIQUE index in the same Tour transaction.
    public Task CloseExpiredAsync(Guid invitationId, DateTimeOffset now, CancellationToken ct) =>
        context.BrowserSessions.Where(s => s.InvitationId == invitationId && s.EndedAt == null && s.ExpiresAt <= now)
            .ExecuteUpdateAsync(update => update.SetProperty(s => s.EndedAt, now).SetProperty(s => s.EndReason, "IDLE_TIMEOUT"), ct);
}
