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
        t.RouteRevisionId, t.TourRobotReservations.Where(r => r.ReleasedAt == null)
            .Select(r => new TourReservationView(r.Robot.RobotCode, r.StartsAt, r.EndsAt, r.MeasuredDurationSeconds, r.ReleasedAt,
                r.ExpectedDurationSeconds ?? r.MeasuredDurationSeconds)).FirstOrDefault(),
        // The leg command FindLegCommandAsync reads, as subqueries of this one statement.
        new TourExecutionSummary(t.OperationalStatus, t.AssistanceReason, t.CurrentStep,
            t.RobotCommands.Where(c => c.LegId == t.CurrentLegId && c.Kind == RobotCommandKinds.GoTo).Select(c => c.State).FirstOrDefault(),
            t.RobotCommands.Any(c => c.Kind == RobotCommandKinds.GoTo && c.State == RobotCommandStates.Unknown)),
        // The assigned Operator (ADR-0034); a legacy Tour has none. CreatedByUserId is attribution, never this.
        t.OperatorUser == null ? null : new RouteTestParticipantView(t.OperatorUser.Id, t.OperatorUser.FullName, t.OperatorUser.Username));

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
            a.EntityType == "Tour" && (a.Action == "TOUR_CREATED" || a.Action == "TOUR_UPDATED" || a.Action == "TOUR_CANCELLED" ||
            a.Action == TourLifecycleEvents.Ready || a.Action == TourLifecycleEvents.Reopened ||
            a.Action == TourLifecycleEvents.Started || a.Action == TourLifecycleEvents.Next ||
            a.Action == TourLifecycleEvents.EndedEarly || a.Action == TourLifecycleEvents.LegRetried ||
            a.Action == TourLifecycleEvents.CommandReconciled), ct);

    public async Task<PagedResult<TourSummary>> ListAsync(TourListRequest request, CancellationToken ct)
    {
        var query = db.Tours.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(t => t.Name.Contains(search) || (t.Description != null && t.Description.Contains(search)) || t.Route.Name.Contains(search));
        }
        if (request.State is not null) query = query.Where(t => t.State == request.State);
        query = request.Phase switch
        {
            TourPhases.Upcoming => query.Where(t => (t.State == "SCHEDULED" || t.State == "READY") && t.ScheduledStartAt > request.Now),
            TourPhases.Running => query.Where(t => t.State == "RUNNING"),
            TourPhases.Finished => query.Where(t => t.State == "COMPLETED" || t.State == "ENDED" || t.State == "CANCELLED"),
            _ => query
        };
        if (request.OperatorUserId is { } operatorUserId) query = query.Where(t => t.OperatorUserId == operatorUserId);
        if (request.NeedsReconcile)
            query = query.Where(t => t.RobotCommands.Any(c => c.Kind == RobotCommandKinds.GoTo && c.State == RobotCommandStates.Unknown));
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
        // READY and Reopen are Staff decisions before Start; they must not lock the Tour as if it had run.
        await db.TourEvents.AnyAsync(e => e.TourId == id && e.EventType != "TOUR_ROUTE_CHANGED" &&
            e.EventType != TourLifecycleEvents.Ready && e.EventType != TourLifecycleEvents.Reopened, ct) ||
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

    public async Task<IReadOnlyList<TourReservationHold>> GetActiveReservationsAsync(Guid robotId, DateTimeOffset startsAt, DateTimeOffset endsAt, CancellationToken ct) =>
        await db.TourRobotReservations.AsNoTracking().Where(r => r.RobotId == robotId && r.ReleasedAt == null &&
            r.StartsAt < endsAt && r.EndsAt > startsAt).OrderBy(r => r.StartsAt)
            .Select(r => new TourReservationHold(r.Tour.Name, r.StartsAt, r.EndsAt)).ToArrayAsync(ct);

    public Task<TourRobotReservation?> FindActiveReservationAsync(Guid id, CancellationToken ct) =>
        db.TourRobotReservations.SingleOrDefaultAsync(r => r.TourId == id && r.ReleasedAt == null, ct);

    public Task<bool> HasRobotTourNeedingAssistanceAsync(Guid robotId, Guid? exceptTourId, CancellationToken ct) =>
        db.Tours.AsNoTracking().AnyAsync(t => t.OperationalStatus == "NEEDS_ASSISTANCE" && t.Id != exceptTourId &&
            (db.Robots.Any(r => r.Id == robotId && r.CurrentTourId == t.Id) || (t.AssignedRobotId == robotId && t.State == "RUNNING")), ct);

    public Task<bool> HasOpenCommandAsync(Guid robotId, CancellationToken ct) =>
        db.RobotCommands.AsNoTracking().AnyAsync(c => c.RobotId == robotId && c.IsOpen, ct);

    public async Task<bool> TryClaimRobotAsync(Guid robotId, Guid tourId, DateTimeOffset now, CancellationToken ct) =>
        await db.Robots.Where(r => r.Id == robotId && r.CurrentTourId == null && !r.NeedsInspection && r.IsDispatchEnabled && r.DeactivatedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(r => r.CurrentTourId, tourId).SetProperty(r => r.LastAssignedAt, now), ct) == 1;

    public async Task<bool> ReleaseRobotAsync(Guid robotId, Guid tourId, CancellationToken ct) =>
        await db.Robots.Where(r => r.Id == robotId && r.CurrentTourId == tourId && !r.NeedsInspection)
            .ExecuteUpdateAsync(set => set.SetProperty(r => r.CurrentTourId, (Guid?)null), ct) == 1;

    public Task<RobotCommand?> FindCommandAsync(Guid id, CancellationToken ct) =>
        db.RobotCommands.AsNoTracking().SingleOrDefaultAsync(c => c.Id == id, ct);

    public Task<RobotCommand?> LockCommandAsync(Guid id, CancellationToken ct) =>
        db.RobotCommands.FromSqlInterpolated($"SELECT * FROM dbo.RobotCommands WITH (UPDLOCK, ROWLOCK) WHERE Id = {id}").SingleOrDefaultAsync(ct);

    public Task<RobotCommand?> LockOpenGoToAsync(Guid tourId, CancellationToken ct) =>
        db.RobotCommands.FromSqlInterpolated($"SELECT * FROM dbo.RobotCommands WITH (UPDLOCK, ROWLOCK) WHERE TourId = {tourId} AND Kind = {RobotCommandKinds.GoTo} AND IsOpen = 1").SingleOrDefaultAsync(ct);

    public Task<RobotCommand?> LockOpenCancelAsync(Guid goToId, CancellationToken ct) =>
        db.RobotCommands.FromSqlInterpolated($"SELECT * FROM dbo.RobotCommands WITH (UPDLOCK, ROWLOCK) WHERE TargetCommandId = {goToId} AND IsOpen = 1").SingleOrDefaultAsync(ct);

    public async Task<IReadOnlyList<RobotCommand>> ListOpenCommandsAsync(CancellationToken ct) =>
        await db.RobotCommands.AsNoTracking().Where(c => c.IsOpen).ToArrayAsync(ct);

    public Task<Guid?> FindOpenCommandTourAsync(Guid robotId, CancellationToken ct) =>
        db.RobotCommands.AsNoTracking().Where(c => c.RobotId == robotId && c.IsOpen).Select(c => (Guid?)c.TourId).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<Guid>> ListRunningTourIdsAsync(CancellationToken ct) =>
        await db.Tours.AsNoTracking().Where(t => t.State == TourRuntime.Running).Select(t => t.Id).ToArrayAsync(ct);

    public async Task<IReadOnlyList<Guid>> ListOverdueUnstartedTourIdsAsync(DateTimeOffset now, TimeSpan startLateLimit, CancellationToken ct)
    {
        // The hold never ends before the Start window closes, so that bound alone narrows the scan in SQL.
        var startedBy = now - startLateLimit;
        var candidates = await db.Tours.AsNoTracking()
            .Where(t => (t.State == "SCHEDULED" || t.State == "READY") && t.ScheduledStartAt <= startedBy)
            .Select(t => new
            {
                t.Id, t.ScheduledStartAt,
                EndsAt = t.TourRobotReservations.Where(r => r.ReleasedAt == null).Select(r => (DateTimeOffset?)r.EndsAt).FirstOrDefault()
            }).ToArrayAsync(ct);
        return candidates.Select(t => (t.Id, HoldEndsAt: TourAutoCancel.HoldEndsAt(t.ScheduledStartAt, t.EndsAt, startLateLimit)))
            .Where(t => t.HoldEndsAt <= now).OrderBy(t => t.HoldEndsAt).ThenBy(t => t.Id).Select(t => t.Id).ToArray();
    }

    public Task MarkRobotNeedsInspectionAsync(Guid robotId, CancellationToken ct) =>
        db.Robots.Where(r => r.Id == robotId).ExecuteUpdateAsync(set => set.SetProperty(r => r.NeedsInspection, true), ct);

    public async Task<bool> ReleaseInspectionAsync(Guid robotId, byte[] expectedRowVersion, CancellationToken ct) =>
        await db.Robots.Where(r => r.Id == robotId && r.RowVersion == expectedRowVersion)
            .ExecuteUpdateAsync(set => set.SetProperty(r => r.CurrentTourId, (Guid?)null).SetProperty(r => r.NeedsInspection, false), ct) == 1;

    public Task<AuditLog?> FindRobotRequestAsync(Guid actor, Guid requestId, CancellationToken ct) =>
        db.AuditLogs.AsNoTracking().SingleOrDefaultAsync(a => a.ActorUserId == actor && a.CorrelationId == requestId &&
            a.EntityType == "Robot" && a.Action == TourLifecycleEvents.InspectionReleased, ct);

    public Task<RobotCommand?> FindLegCommandAsync(Guid legId, CancellationToken ct) =>
        db.RobotCommands.AsNoTracking().SingleOrDefaultAsync(c => c.LegId == legId && c.Kind == RobotCommandKinds.GoTo, ct);

    public Task<TourEvent?> FindCommandEventAsync(Guid commandId, string eventType, CancellationToken ct) =>
        db.TourEvents.AsNoTracking().Where(e => e.CommandId == commandId && e.EventType == eventType).OrderBy(e => e.Id).FirstOrDefaultAsync(ct);

    public async Task<TourTargetView> GetTargetAsync(Guid id, CancellationToken ct)
    {
        var operatorUser = await db.Tours.AsNoTracking().Where(t => t.Id == id && t.OperatorUserId != null)
            .Select(t => new RouteTestParticipantView(t.OperatorUser!.Id, t.OperatorUser.FullName, t.OperatorUser.Username))
            .SingleOrDefaultAsync(ct);
        // A cancelled Tour shows the reservation it released, the newest row by time.
        var reservation = await db.TourRobotReservations.AsNoTracking().Where(r => r.TourId == id)
            .OrderByDescending(r => r.ReservedAt).ThenBy(r => r.Id)
            .Select(r => new TourReservationView(r.Robot.RobotCode, r.StartsAt, r.EndsAt, r.MeasuredDurationSeconds, r.ReleasedAt,
                r.ExpectedDurationSeconds ?? r.MeasuredDurationSeconds))
            .FirstOrDefaultAsync(ct);
        return new(operatorUser, reservation);
    }

    public void Add(Tour tour) => db.Tours.Add(tour);
    public void Add(TourRobotReservation reservation) => db.TourRobotReservations.Add(reservation);
    public void Add(RobotCommand command) => db.RobotCommands.Add(command);
    public void AddAudit(AuditLog audit) => db.AuditLogs.Add(audit);
    public void AddEvent(TourEvent tourEvent) => db.TourEvents.Add(tourEvent);
    public void AddRouteChangeEvent(Tour tour, Guid previousRouteId, Guid actor, DateTimeOffset now) => db.TourEvents.Add(new TourEvent
    {
        TourId = tour.Id, RouteId = previousRouteId, ActorUserId = actor, OccurredAt = now,
        EventType = "TOUR_ROUTE_CHANGED", ReasonCode = "CONFIGURATION_UPDATED"
    });
}
