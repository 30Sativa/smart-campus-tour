using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

// Shared persistence for Representative mutations and Admin review, using the same scoped context/transaction.
public sealed class EfRegistrationRepository(ApplicationDbContext context) : IRegistrationRepository
{
    public Task<Guid?> FindTourIdAsync(Guid id, Guid? owner, CancellationToken ct) =>
        context.GroupRegistrations.AsNoTracking().Where(r => r.Id == id && (owner == null || r.RepresentativeUserId == owner))
            .Select(r => (Guid?)r.TourId).SingleOrDefaultAsync(ct);
    public Task<Tour?> LockTourAsync(Guid id, CancellationToken ct) =>
        context.Tours.FromSqlInterpolated($"SELECT * FROM dbo.Tours WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}").SingleOrDefaultAsync(ct);
    public async Task<GroupRegistration?> LockRegistrationAsync(Guid id, Guid? owner, CancellationToken ct)
    {
        var registration = await context.GroupRegistrations
            .FromSqlInterpolated($"SELECT * FROM dbo.GroupRegistrations WITH (UPDLOCK, ROWLOCK) WHERE Id = {id} AND ({owner} IS NULL OR RepresentativeUserId = {owner})")
            .SingleOrDefaultAsync(ct);
        // Replacement only deactivates current rows; inactive history stays unloaded so repeated edits do not grow the tracked set.
        if (registration is not null)
            await context.Entry(registration).Collection(r => r.RosterRows).Query().Where(row => row.IsActive).LoadAsync(ct);
        return registration;
    }
    public async Task<Guid?> FindSubmissionAsync(Guid owner, Guid tour, Guid key, CancellationToken ct)
    {
        var id = await context.AuditLogs.Where(a => a.ActorUserId == owner && a.TourId == tour &&
            a.CorrelationId == key && a.Action == RegistrationAudit.SubmittedAuditAction &&
            a.EntityType == RegistrationAudit.RegistrationEntityType)
            .Select(a => a.EntityId).SingleOrDefaultAsync(ct);
        return id is null ? null : Guid.Parse(id);
    }
    public Task<bool> HasInvitationsAsync(Guid registration, CancellationToken ct) =>
        context.Invitations.AnyAsync(i => i.RosterRow.RegistrationId == registration, ct);
    public async Task<IReadOnlyList<int>> ReservedEmailIndexesAsync(Guid tour, Guid? excludingRegistration,
        IReadOnlyList<string> emails, CancellationToken ct)
    {
        var reserved = await context.RosterRows.AsNoTracking().Where(r => r.IsActive &&
            r.Registration.TourId == tour && (excludingRegistration == null || r.RegistrationId != excludingRegistration) &&
            (r.Registration.State == RegistrationConsistency.Submitted || r.Registration.State == RegistrationConsistency.Approved)).Select(r => r.Email).ToListAsync(ct);
        var reservedSet = reserved.Select(RegistrationConsistency.NormalizeEmail).ToHashSet(StringComparer.Ordinal);
        return emails.Select((email, index) => (email, index))
            .Where(item => reservedSet.Contains(RegistrationConsistency.NormalizeEmail(item.email)))
            .Select(item => item.index).ToArray();
    }
    public void AddRegistration(GroupRegistration registration) => context.GroupRegistrations.Add(registration);
    public void AddAudit(AuditLog audit) => context.AuditLogs.Add(audit);
}
