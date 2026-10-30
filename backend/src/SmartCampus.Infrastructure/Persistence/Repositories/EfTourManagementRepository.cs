using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfTourManagementRepository(ApplicationDbContext db) : ITourManagementRepository
{
    public async Task<IAsyncDisposable> BeginReadAsync(Guid id, CancellationToken ct) =>
        await RegistrationReadSnapshot.ForTourAsync(db, id, ct);

    private static readonly Expression<Func<Tour, TourSummary>> Summary = t => new(
        t.Id, t.Name, t.Description, t.RouteId, t.Route.Name, t.ActiveRouteId, t.ScheduledStartAt,
        t.State, t.CreatedByUserId, t.CreatedAt, t.UpdatedAt, Convert.ToBase64String(t.RowVersion),
        t.GroupRegistrations.Count, t.GroupRegistrations.SelectMany(r => r.RosterRows).Count(row => row.Invitation != null),
        t.RouteRevisionId);

    public Task LockRequestAsync(Guid actor, Guid requestId, CancellationToken ct)
    {
        var resource = $"tour-management:{actor:D}:{requestId:D}";
        return db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @result int;
            EXEC @result = sys.sp_getapplock @Resource={resource}, @LockMode='Exclusive',
                @LockOwner='Transaction', @LockTimeout=10000;
            IF @result < 0 THROW 51021, 'Tour request lock unavailable.', 1;
            """, ct);
    }

    public Task<AuditLog?> FindRequestAsync(Guid actor, Guid requestId, CancellationToken ct) =>
        db.AuditLogs.AsNoTracking().SingleOrDefaultAsync(a => a.ActorUserId == actor && a.CorrelationId == requestId &&
            a.EntityType == "Tour" && (a.Action == "TOUR_CREATED" || a.Action == "TOUR_UPDATED" || a.Action == "TOUR_CANCELLED"), ct);

    public async Task<PagedResult<TourSummary>> ListAsync(TourListRequest request, CancellationToken ct)
    {
        var query = db.Tours.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(t => t.Name.Contains(search) || (t.Description != null && t.Description.Contains(search)) || t.Route.Name.Contains(search));
        }
        if (request.State is not null) query = query.Where(t => t.State == request.State);
        if (request.From.HasValue) query = query.Where(t => t.ScheduledStartAt >= request.From.Value);
        if (request.To.HasValue) query = query.Where(t => t.ScheduledStartAt <= request.To.Value);
        var count = await query.LongCountAsync(ct);
        var ordered = request.Sort switch
        {
            "name" => query.OrderBy(t => t.Name),
            "-name" => query.OrderByDescending(t => t.Name),
            "-scheduledStartAt" => query.OrderByDescending(t => t.ScheduledStartAt),
            "createdAt" => query.OrderBy(t => t.CreatedAt),
            "-createdAt" => query.OrderByDescending(t => t.CreatedAt),
            _ => query.OrderBy(t => t.ScheduledStartAt)
        };
        return new(await ordered.ThenBy(t => t.Id).Skip((request.Page - 1) * request.Size).Take(request.Size).Select(Summary).ToArrayAsync(ct),
            request.Page, request.Size, count);
    }

    public Task<Tour?> FindAsync(Guid id, CancellationToken ct) => db.Tours.AsNoTracking().SingleOrDefaultAsync(t => t.Id == id, ct);
    public Task<TourSummary?> GetSummaryAsync(Guid id, CancellationToken ct) =>
        db.Tours.AsNoTracking().Where(t => t.Id == id).Select(Summary).SingleOrDefaultAsync(ct);

    public async Task<TourUsage> GetUsageAsync(Guid id, CancellationToken ct) => new(
        await db.GroupRegistrations.AnyAsync(r => r.TourId == id, ct),
        await db.TourAllowedBranches.AnyAsync(b => b.TourId == id, ct),
        await db.TourEvents.AnyAsync(e => e.TourId == id && e.EventType != "TOUR_ROUTE_CHANGED", ct) ||
            await db.BranchRequests.AnyAsync(b => b.TourId == id, ct),
        await db.Robots.AnyAsync(r => r.CurrentTourId == id, ct));

    public async Task<IReadOnlyList<GroupRegistration>> LoadCancellationRegistrationsAsync(Guid id, CancellationToken ct) =>
        await db.GroupRegistrations.Where(r => r.TourId == id).OrderBy(r => r.Id).ToArrayAsync(ct);

    public Task LockRobotReservationsAsync(Guid robotId, CancellationToken ct)
    {
        var resource = $"tour-robot-reservation:{robotId:D}";
        return db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @result int;
            EXEC @result = sys.sp_getapplock @Resource={resource}, @LockMode='Exclusive',
                @LockOwner='Transaction', @LockTimeout=10000;
            IF @result < 0 THROW 51103, 'Robot reservation lock unavailable.', 1;
            """, ct);
    }

    public Task<bool> HasActiveReservationOverlapAsync(Guid robotId, DateTimeOffset startsAt, DateTimeOffset endsAt, CancellationToken ct) =>
        db.TourRobotReservations.AsNoTracking().AnyAsync(r => r.RobotId == robotId && r.ReleasedAt == null &&
            r.StartsAt < endsAt && r.EndsAt > startsAt, ct);

    public Task<TourRobotReservation?> FindActiveReservationAsync(Guid id, CancellationToken ct) =>
        db.TourRobotReservations.SingleOrDefaultAsync(r => r.TourId == id && r.ReleasedAt == null, ct);

    public async Task<TourTargetView> GetTargetAsync(Guid id, CancellationToken ct)
    {
        var operatorUser = await db.Tours.AsNoTracking().Where(t => t.Id == id && t.OperatorUserId != null)
            .Select(t => new RouteTestParticipantView(t.OperatorUser!.Id, t.OperatorUser.FullName, t.OperatorUser.Username))
            .SingleOrDefaultAsync(ct);
        // A cancelled Tour shows the reservation it released, the newest row by time.
        var reservation = await db.TourRobotReservations.AsNoTracking().Where(r => r.TourId == id)
            .OrderByDescending(r => r.ReservedAt).ThenBy(r => r.Id)
            .Select(r => new TourReservationView(r.Robot.RobotCode, r.StartsAt, r.EndsAt, r.MeasuredDurationSeconds, r.ReleasedAt))
            .FirstOrDefaultAsync(ct);
        return new(operatorUser, reservation);
    }

    public void Add(Tour tour) => db.Tours.Add(tour);
    public void Add(TourRobotReservation reservation) => db.TourRobotReservations.Add(reservation);
    public void AddAudit(AuditLog audit) => db.AuditLogs.Add(audit);
    public void AddRouteChangeEvent(Tour tour, Guid previousRouteId, Guid actor, DateTimeOffset now) => db.TourEvents.Add(new TourEvent
    {
        TourId = tour.Id, RouteId = previousRouteId, ActorUserId = actor, OccurredAt = now,
        EventType = "TOUR_ROUTE_CHANGED", ReasonCode = "CONFIGURATION_UPDATED"
    });
}
