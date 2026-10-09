using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations.Dtos;
using SmartCampus.Application.Features.Representative.Queries.Lists;
using SmartCampus.Application.Features.Representative.Queries.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfRepresentativeRepository(ApplicationDbContext context) : IRepresentativeRepository
{
    private static readonly Expression<Func<GroupRegistration, RegistrationListItem>> Summary = r =>
        new(r.Id, r.TourId, r.Tour.Name, r.Tour.ScheduledStartAt, r.Tour.State, r.SchoolName, r.GroupName,
            r.State, r.RosterRows.Count(row => row.IsActive), r.SubmittedAt, r.UpdatedAt ?? r.CreatedAt);

    public async Task<PagedResult<TourReadModel>> ListToursAsync(RepresentativeListRequest request, CancellationToken ct)
    {
        var query = context.Tours.AsNoTracking().Where(t => t.State == RegistrationGate.OpenTourState);
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
            .Where(t => t.Id == id && (t.State == RegistrationGate.OpenTourState || t.GroupRegistrations.Any(r => r.RepresentativeUserId == owner)))
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
        await using var snapshot = await RegistrationReadSnapshot.BeginAsync(context, id, owner, ct);
        if (snapshot is null) return null;
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
    private static int Offset(RepresentativeListRequest request) => (int)Math.Min((long)(request.Page - 1) * request.Size, int.MaxValue);
}
