using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

// Shared persistence for registration writers, using the same scoped context/transaction.
public sealed class EfRegistrationRepository(ApplicationDbContext context) : IRegistrationRepository
{
    public Task<Tour?> LockTourAsync(Guid id, CancellationToken ct) =>
        context.Tours.FromSqlInterpolated($"SELECT * FROM dbo.Tours WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}").SingleOrDefaultAsync(ct);

    public async Task<(Tour Tour, GroupRegistration Registration)?> LockRegistrationAsync(Guid id, Guid? owner, CancellationToken ct)
    {
        // A registration never moves to another Tour, so its unlocked TourId is safe to lock first.
        var tourId = await context.GroupRegistrations.AsNoTracking()
            .Where(r => r.Id == id && (owner == null || r.RepresentativeUserId == owner))
            .Select(r => (Guid?)r.TourId).SingleOrDefaultAsync(ct);
        if (tourId is null) return null;
        var tour = await LockTourAsync(tourId.Value, ct);
        var registration = await context.GroupRegistrations
            .FromSqlInterpolated($"SELECT * FROM dbo.GroupRegistrations WITH (UPDLOCK, ROWLOCK) WHERE Id = {id} AND ({owner} IS NULL OR RepresentativeUserId = {owner})")
            .SingleOrDefaultAsync(ct);
        if (tour is null || registration is null) return null;
        // Replacement only deactivates current rows; inactive history stays unloaded so repeated edits do not grow the tracked set.
        await context.Entry(registration).Collection(r => r.RosterRows).Query().Where(row => row.IsActive).LoadAsync(ct);
        return (tour, registration);
    }

    public async Task<Guid?> FindSubmissionAsync(Guid owner, Guid tour, Guid key, CancellationToken ct)
    {
        var id = await context.AuditLogs.Where(a => a.ActorUserId == owner && a.TourId == tour &&
            a.CorrelationId == key && a.Action == RegistrationAudit.SubmittedAuditAction &&
            a.EntityType == RegistrationAudit.RegistrationEntityType)
            .Select(a => a.EntityId).SingleOrDefaultAsync(ct);
        return id is null ? null : Guid.Parse(id);
    }

    public Task<bool> HasRegistrationForRepresentativeTourAsync(Guid owner, Guid tour, CancellationToken ct) =>
        context.GroupRegistrations.AnyAsync(r => r.RepresentativeUserId == owner && r.TourId == tour, ct);

    public async Task<bool> HasPendingDecisionsAsync(Guid tour, CancellationToken ct) =>
        await context.RosterRows.AnyAsync(row => row.Registration.TourId == tour && row.IsActive && row.ParticipationState == "PENDING", ct) ||
        await context.RosterEmailChangeRequests.AnyAsync(request => request.RosterRow.IsActive &&
            request.RosterRow.Registration.TourId == tour && request.State == "PENDING", ct);

    public Task<int> CountHeldSeatsAsync(Guid tour, Guid? excludingRegistration, CancellationToken ct) =>
        context.RosterRows.AsNoTracking().CountAsync(row => row.Registration.TourId == tour && row.IsActive &&
            (excludingRegistration == null || row.RegistrationId != excludingRegistration) &&
            (row.ParticipationState == RosterParticipationStates.Pending || row.ParticipationState == RosterParticipationStates.Accepted), ct);

    public Task<AuditLog?> FindMutationAsync(Guid tour, Guid requestId, CancellationToken ct) =>
        context.AuditLogs.AsNoTracking().SingleOrDefaultAsync(a => a.TourId == tour && a.CorrelationId == requestId, ct);

    public Task<bool> HasInvitationsAsync(Guid registration, CancellationToken ct) =>
        context.Invitations.AnyAsync(i => i.RosterRow.RegistrationId == registration, ct);

    public Task<AuditLog?> FindEmailCorrectionAsync(Guid tour, Guid requestId, CancellationToken ct) =>
        context.AuditLogs.AsNoTracking().SingleOrDefaultAsync(a => a.TourId == tour && a.CorrelationId == requestId &&
            a.Action == SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail.CorrectRosterEmailCommandHandler.AuditAction, ct);

    public Task<bool> HasLaterEmailCorrectionAsync(Guid tour, Guid row, long receiptId, CancellationToken ct) =>
        context.AuditLogs.AnyAsync(a => a.TourId == tour && a.EntityId == row.ToString("D") && a.Id > receiptId &&
            a.Action == SmartCampus.Application.Features.RosterEmailCorrection.Commands.CorrectRosterEmail.CorrectRosterEmailCommandHandler.AuditAction, ct);

    public async Task<IReadOnlyList<int>> ReservedEmailIndexesAsync(Guid tour, Guid? excludingRegistration,
        IReadOnlyList<string> emails, CancellationToken ct)
    {
        var reserved = await context.RosterRows.AsNoTracking().Where(r => r.IsActive &&
            r.Registration.TourId == tour && (excludingRegistration == null || r.RegistrationId != excludingRegistration) &&
            (r.ParticipationState == RosterParticipationStates.Pending || r.ParticipationState == RosterParticipationStates.Accepted))
            .Select(r => r.Email).ToListAsync(ct);
        var pendingProposals = await context.RosterEmailChangeRequests.AsNoTracking().Where(request =>
                request.State == "PENDING" && request.RosterRow.IsActive && request.RosterRow.Registration.TourId == tour &&
                (excludingRegistration == null || request.RosterRow.RegistrationId != excludingRegistration))
            .Select(request => request.ProposedEmail).ToListAsync(ct);
        reserved.AddRange(pendingProposals);
        var reservedSet = reserved.Select(RegistrationEmail.Normalize).ToHashSet(StringComparer.Ordinal);
        return emails.Select((email, index) => (email, index))
            .Where(item => reservedSet.Contains(RegistrationEmail.Normalize(item.email)))
            .Select(item => item.index).ToArray();
    }

    public void AddRegistration(GroupRegistration registration) => context.GroupRegistrations.Add(registration);
    public void AddAudit(AuditLog audit) => context.AuditLogs.Add(audit);
}
