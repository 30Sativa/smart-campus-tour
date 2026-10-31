using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfInvitationRepository(ApplicationDbContext context) : IInvitationRepository
{
    public async Task<IReadOnlyList<Invitation>> LoadAsync(Guid registrationId, CancellationToken ct) =>
        await context.Invitations.Include(i => i.RosterRow).ThenInclude(r => r.Registration)
            .Include(i => i.BrowserSessions.Where(s => s.EndedAt == null))
            .Where(i => i.RosterRow.RegistrationId == registrationId).ToArrayAsync(ct);
    public async Task<IReadOnlyList<Invitation>> LoadForTourCancellationAsync(Guid tourId, CancellationToken ct) =>
        await context.Invitations.Where(i => i.RosterRow.Registration.TourId == tourId &&
                (i.RevokedAt == null || i.BrowserSessions.Any(s => s.EndedAt == null)))
            .Include(i => i.BrowserSessions.Where(s => s.EndedAt == null)).ToArrayAsync(ct);
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

    public Task<AuditLog?> GetTourCancelNoticeAsync(Guid attemptId, CancellationToken ct) =>
        context.AuditLogs.AsNoTracking().SingleOrDefaultAsync(a => a.CorrelationId == attemptId && a.Action == TourCancelNoticeAudit.Requested, ct);
    public Task<bool> HasTourCancelNoticeStartedAsync(Guid attemptId, CancellationToken ct) =>
        context.AuditLogs.AnyAsync(a => a.CorrelationId == attemptId && a.Action == TourCancelNoticeAudit.Started, ct);
    public Task<bool> HasTourCancelNoticeResultAsync(Guid attemptId, CancellationToken ct) =>
        context.AuditLogs.AnyAsync(a => a.CorrelationId == attemptId &&
            (a.Action == TourCancelNoticeAudit.Sent || a.Action == TourCancelNoticeAudit.Failed), ct);
    public async Task<IReadOnlyList<EmailWorkItem>> PendingTourCancelNoticesAsync(DateTimeOffset staleBefore, CancellationToken ct) =>
        await context.AuditLogs.AsNoTracking().Where(a => a.Action == TourCancelNoticeAudit.Requested &&
            !context.AuditLogs.Any(result => result.CorrelationId == a.CorrelationId &&
                (result.Action == TourCancelNoticeAudit.Sent || result.Action == TourCancelNoticeAudit.Failed)) &&
            (!context.AuditLogs.Any(start => start.CorrelationId == a.CorrelationId && start.Action == TourCancelNoticeAudit.Started) ||
                context.AuditLogs.Any(start => start.CorrelationId == a.CorrelationId && start.Action == TourCancelNoticeAudit.Started && start.OccurredAt < staleBefore)))
            .OrderBy(a => a.Id).Take(20).Select(a => new EmailWorkItem(a.CorrelationId!.Value,
                context.AuditLogs.Any(start => start.CorrelationId == a.CorrelationId && start.Action == TourCancelNoticeAudit.Started))).ToArrayAsync(ct);
    public async Task<IReadOnlyList<TourCancelRecipient>> LoadTourCancelRecipientsAsync(IReadOnlyCollection<Guid> registrationIds, CancellationToken ct) =>
        await context.GroupRegistrations.AsNoTracking().Where(r => registrationIds.Contains(r.Id)).OrderBy(r => r.Id)
            .Select(r => new TourCancelRecipient(r.Id, r.ContactEmail)).ToArrayAsync(ct);

    public async Task<InvitationReadModel?> ReadAsync(Guid registrationId, Guid? owner, CancellationToken ct)
    {
        await using var snapshot = await RegistrationReadSnapshot.BeginAsync(context, registrationId, owner, ct);
        if (snapshot is null) return null;
        var registration = await context.GroupRegistrations.AsNoTracking().Include(r => r.Tour)
            .Include(r => r.RosterRows.Where(row => row.IsActive))
            .SingleAsync(r => r.Id == registrationId && (owner == null || r.RepresentativeUserId == owner), ct);
        var invitations = await context.Invitations.AsNoTracking().Include(i => i.RosterRow)
            .Where(i => i.RosterRow.RegistrationId == registrationId).ToArrayAsync(ct);
        var ids = invitations.Select(i => i.Id.ToString("D")).ToArray();
        // At most one request and its latest outcome per invitation, regardless of historical resend count.
        var latest = context.AuditLogs.Where(a => a.EntityType == "Invitation" && ids.Contains(a.EntityId) &&
            a.Action == InvitationAudit.Requested && !context.AuditLogs.Any(newer =>
                newer.EntityType == a.EntityType && newer.EntityId == a.EntityId && newer.Action == a.Action && newer.Id > a.Id));
        var audits = await context.AuditLogs.AsNoTracking().Where(a =>
            a.EntityType == "Invitation" && ids.Contains(a.EntityId) &&
            (a.Action == InvitationAudit.Requested || a.Action == InvitationAudit.Result) &&
            latest.Any(request => request.Id == a.Id ||
                a.EntityType == "Invitation" && a.Action == InvitationAudit.Result && a.CorrelationId == request.CorrelationId &&
                !context.AuditLogs.Any(newer => newer.EntityType == a.EntityType && newer.Action == a.Action &&
                    newer.CorrelationId == a.CorrelationId && newer.Id > a.Id)))
            .OrderBy(a => a.Id).ToArrayAsync(ct);
        return new(invitations, registration.Tour, registration, audits);
    }
}
