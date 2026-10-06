using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Representative;
using SmartCampus.Application.Features.Representative.Dtos;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfRepresentativeRepository(ApplicationDbContext context) : IRepresentativeRepository
{
    private static readonly Expression<Func<GroupRegistration, RegistrationListItem>> Summary = r =>
        new(r.Id, r.TourId, r.Tour.Name, r.Tour.ScheduledStartAt, r.Tour.State, r.SchoolName, r.GroupName,
            r.State, r.RosterRows.Count(row => row.IsActive), r.SubmittedAt, r.UpdatedAt ?? r.CreatedAt);

    public async Task<PagedResult<TourReadModel>> ListToursAsync(RepresentativeListRequest request, CancellationToken ct)
    {
        var query = context.Tours.AsNoTracking().Where(t => t.State == RegistrationRules.Scheduled);
        if (!string.IsNullOrWhiteSpace(request.Search))
            query = query.Where(t => t.Name.Contains(request.Search.Trim()) || t.Route.Name.Contains(request.Search.Trim()));
        var total = await query.LongCountAsync(ct);
        query = request.Sort switch
        {
            "name" => query.OrderBy(t => t.Name).ThenBy(t => t.Id),
            "-name" => query.OrderByDescending(t => t.Name).ThenBy(t => t.Id),
            "-scheduledStartAt" => query.OrderByDescending(t => t.ScheduledStartAt).ThenBy(t => t.Id),
            _ => query.OrderBy(t => t.ScheduledStartAt).ThenBy(t => t.Id)
        };
        var tours = await query.Skip(Offset(request)).Take(request.Size)
            .Include(t => t.Route).ThenInclude(r => r.RouteStops).ThenInclude(s => s.Poi).ToListAsync(ct);
        return new(tours.Select(MapTour).ToArray(), request.Page, request.Size, total);
    }
    public async Task<TourReadModel?> GetTourAsync(Guid id, Guid owner, CancellationToken ct)
    {
        var tour = await context.Tours.AsNoTracking()
            .Where(t => t.Id == id && (t.State == RegistrationRules.Scheduled || t.GroupRegistrations.Any(r => r.RepresentativeUserId == owner)))
            .Include(t => t.Route).ThenInclude(r => r.RouteStops).ThenInclude(s => s.Poi).SingleOrDefaultAsync(ct);
        return tour is null ? null : MapTour(tour);
    }
    private static TourReadModel MapTour(Tour tour) => new(tour.Id, tour.Name, tour.Description, tour.ScheduledStartAt,
        tour.State, tour.RowVersion, tour.Route.Name,
        tour.Route.RouteStops.OrderBy(s => s.StopOrder).Select(s => new TourStopResponse(s.StopOrder, s.Poi.Name, s.Poi.Description)).ToArray());
    public async Task<PagedResult<RegistrationListItem>> ListRegistrationsAsync(Guid owner, RepresentativeListRequest request, CancellationToken ct)
    {
        var query = context.GroupRegistrations.AsNoTracking().Where(r => r.RepresentativeUserId == owner);
        if (request.TourId is not null) query = query.Where(r => r.TourId == request.TourId);
        if (request.State is not null) query = query.Where(r => r.State == request.State);
        if (!string.IsNullOrWhiteSpace(request.Search))
            query = query.Where(r => r.GroupName.Contains(request.Search.Trim()) || r.SchoolName.Contains(request.Search.Trim()) ||
                r.Tour.Name.Contains(request.Search.Trim()));
        var total = await query.LongCountAsync(ct);
        query = request.Sort switch
        {
            "groupName" => query.OrderBy(r => r.GroupName).ThenBy(r => r.Id),
            "-groupName" => query.OrderByDescending(r => r.GroupName).ThenBy(r => r.Id),
            "submittedAt" => query.OrderBy(r => r.SubmittedAt).ThenBy(r => r.Id),
            "-submittedAt" => query.OrderByDescending(r => r.SubmittedAt).ThenBy(r => r.Id),
            "updatedAt" => query.OrderBy(r => r.UpdatedAt ?? r.CreatedAt).ThenBy(r => r.Id),
            _ => query.OrderByDescending(r => r.UpdatedAt ?? r.CreatedAt).ThenBy(r => r.Id)
        };
        return new(await query.Skip(Offset(request)).Take(request.Size).Select(Summary).ToArrayAsync(ct),
            request.Page, request.Size, total);
    }
    public async Task<RegistrationReadModel?> GetRegistrationAsync(Guid id, Guid owner, CancellationToken ct)
    {
        // One SQL statement: the row version, roster and invitation-history gate agree.
        var result = await context.GroupRegistrations.AsNoTracking()
            .Where(r => r.Id == id && r.RepresentativeUserId == owner)
            .Select(r => new
            {
                Summary = new RegistrationListItem(r.Id, r.TourId, r.Tour.Name, r.Tour.ScheduledStartAt, r.Tour.State,
                    r.SchoolName, r.GroupName, r.State, r.RosterRows.Count(row => row.IsActive), r.SubmittedAt, r.UpdatedAt ?? r.CreatedAt),
                r.ContactName, r.ContactEmail, r.RowVersion, TourVersion = r.Tour.RowVersion, r.RejectionReason, r.ReviewedAt,
                HasInvitations = r.RosterRows.Any(row => row.Invitation != null),
                Rows = r.RosterRows.Where(row => row.IsActive).OrderBy(row => row.RowNumber)
                    .Select(row => new RosterInput(row.RowNumber, row.RowType, row.DisplayName, row.Email, row.ClassName)).ToArray()
            }).SingleOrDefaultAsync(ct);
        return result is null ? null : new(result.Summary, result.ContactName, result.ContactEmail,
            result.RowVersion, result.TourVersion, result.RejectionReason, result.ReviewedAt, result.Rows,
            result.HasInvitations);
    }
    public Task<Guid?> FindOwnedTourIdAsync(Guid id, Guid owner, CancellationToken ct) =>
        context.GroupRegistrations.AsNoTracking().Where(r => r.Id == id && r.RepresentativeUserId == owner)
            .Select(r => (Guid?)r.TourId).SingleOrDefaultAsync(ct);
    public Task<Tour?> LockTourAsync(Guid id, CancellationToken ct) =>
        context.Tours.FromSqlInterpolated($"SELECT * FROM dbo.Tours WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}").SingleOrDefaultAsync(ct);
    public async Task<GroupRegistration?> LockRegistrationAsync(Guid id, Guid owner, CancellationToken ct)
    {
        var registration = await context.GroupRegistrations
            .FromSqlInterpolated($"SELECT * FROM dbo.GroupRegistrations WITH (UPDLOCK, ROWLOCK) WHERE Id = {id} AND RepresentativeUserId = {owner}")
            .SingleOrDefaultAsync(ct);
        // Replacement only deactivates current rows; inactive history stays unloaded so repeated edits do not grow the tracked set.
        if (registration is not null)
            await context.Entry(registration).Collection(r => r.RosterRows).Query().Where(row => row.IsActive).LoadAsync(ct);
        return registration;
    }
    public async Task<Guid?> FindSubmissionAsync(Guid owner, Guid tour, Guid key, CancellationToken ct)
    {
        var id = await context.AuditLogs.Where(a => a.ActorUserId == owner && a.TourId == tour &&
            a.CorrelationId == key && a.Action == RegistrationRules.SubmittedAuditAction &&
            a.EntityType == RegistrationRules.RegistrationEntityType)
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
            (r.Registration.State == RegistrationRules.Submitted || r.Registration.State == RegistrationRules.Approved)).Select(r => r.Email).ToListAsync(ct);
        var incoming = emails.Select(RegistrationRules.NormalizeEmail).ToHashSet(StringComparer.Ordinal);
        var reservedSet = reserved.Select(RegistrationRules.NormalizeEmail).ToHashSet(StringComparer.Ordinal);
        return emails.Select((email, index) => (email, index))
            .Where(item => reservedSet.Contains(RegistrationRules.NormalizeEmail(item.email)))
            .Select(item => item.index).ToArray();
    }
    public void AddRegistration(GroupRegistration registration) => context.GroupRegistrations.Add(registration);
    public void AddAudit(AuditLog audit) => context.AuditLogs.Add(audit);
    private static int Offset(RepresentativeListRequest request) => (int)Math.Min((long)(request.Page - 1) * request.Size, int.MaxValue);
}
