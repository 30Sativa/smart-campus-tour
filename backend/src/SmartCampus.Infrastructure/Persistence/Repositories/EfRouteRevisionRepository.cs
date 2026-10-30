using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Authentication;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfRouteRevisionRepository(ApplicationDbContext db) : IRouteRevisionRepository
{
    public Task LockRequestAsync(Guid actorUserId, Guid requestId, string operation, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = {"route-revision:" + operation + ":" + actorUserId.ToString("D") + ":" + requestId.ToString("D")},
                @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51030, 'Could not acquire Route revision idempotency lock.', 1;
            """, ct);

    public Task<RouteRevision?> FindRequestAsync(Guid actorUserId, Guid requestId, CancellationToken ct) =>
        db.RouteRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.CreatedByUserId == actorUserId && r.RequestId == requestId, ct);

    public Task<Route?> LockRouteAsync(Guid routeId, CancellationToken ct) =>
        db.Routes.FromSqlInterpolated($"SELECT * FROM dbo.Routes WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE Id = {routeId}")
            .SingleOrDefaultAsync(r => r.Id == routeId && r.AuthoringMode == "VERSIONED", ct);

    public Task<Route?> FindRouteAsync(Guid routeId, CancellationToken ct) =>
        db.Routes.AsNoTracking().SingleOrDefaultAsync(r => r.Id == routeId && r.AuthoringMode == "VERSIONED", ct);

    public Task<RouteRevision?> FindRevisionAsync(Guid revisionId, CancellationToken ct) =>
        db.RouteRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.Id == revisionId, ct);

    public Task<RouteRevision?> FindRevisionRequestAsync(Guid routeId, Guid actorUserId, Guid requestId, CancellationToken ct) =>
        db.RouteRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.RouteId == routeId && r.CreatedByUserId == actorUserId && r.RequestId == requestId, ct);

    public Task<RouteRevision?> GetCurrentRevisionAsync(Guid routeId, CancellationToken ct) =>
        db.RouteRevisions.AsNoTracking().Where(r => r.RouteId == routeId)
            .OrderByDescending(r => r.RevisionNumber).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<RouteRevision>> GetRevisionsAsync(Guid routeId, bool submittedOnly, CancellationToken ct)
    {
        var query = db.RouteRevisions.AsNoTracking().Where(r => r.RouteId == routeId);
        if (submittedOnly) query = query.Where(r => db.RouteRevisionSubmissions.Any(s => s.RouteRevisionId == r.Id));
        return await query.OrderByDescending(r => r.RevisionNumber).ToArrayAsync(ct);
    }

    public Task<MapVersion?> GetMapAsync(Guid mapVersionId, CancellationToken ct) =>
        db.MapVersions.AsNoTracking().SingleOrDefaultAsync(m => m.Id == mapVersionId, ct);

    public async Task<IReadOnlyList<RoutePoiRevisionEvidence>> GetPoiEvidenceAsync(IReadOnlyCollection<Guid> revisionIds, CancellationToken ct)
    {
        if (revisionIds.Count == 0) return [];
        var revisions = await db.PoiProposalRevisions.AsNoTracking().Include(r => r.MapVersion)
            .Where(r => revisionIds.Contains(r.Id)).ToArrayAsync(ct);
        var result = new List<RoutePoiRevisionEvidence>(revisions.Length);
        foreach (var revision in revisions)
        {
            var verification = await GetEffectivePoiVerificationAsync(revision.ProposalId, revision.NavigationFingerprint, ct);
            if (verification is not null) result.Add(new RoutePoiRevisionEvidence(revision, verification));
        }
        return result;
    }

    public Task<PoiVerificationRecord?> GetEffectivePoiVerificationAsync(Guid proposalId, byte[] fingerprint, CancellationToken ct) =>
        db.PoiVerificationRecords.AsNoTracking()
            .Where(v => v.ProposalRevision.ProposalId == proposalId && v.NavigationFingerprint == fingerprint)
            .OrderByDescending(v => v.ProposalRevision.RevisionNumber)
            .ThenByDescending(v => v.CheckedAt).ThenByDescending(v => v.Id).FirstOrDefaultAsync(ct);

    public Task<PoiProposalRevision?> FindPoiRevisionAsync(Guid revisionId, CancellationToken ct) =>
        db.PoiProposalRevisions.AsNoTracking().SingleOrDefaultAsync(r => r.Id == revisionId, ct);

    public Task<PoiVerificationRecord?> FindPoiVerificationAsync(Guid verificationId, CancellationToken ct) =>
        db.PoiVerificationRecords.AsNoTracking().SingleOrDefaultAsync(v => v.Id == verificationId, ct);

    public async Task<IReadOnlyList<RouteRevisionStop>> GetStopsAsync(Guid revisionId, CancellationToken ct) =>
        await db.RouteRevisionStops.AsNoTracking().Where(s => s.RouteRevisionId == revisionId)
            .OrderBy(s => s.StopOrder).ToArrayAsync(ct);

    public async Task<IReadOnlyList<RouteRevisionSubmission>> GetSubmissionsAsync(Guid revisionId, CancellationToken ct) =>
        await db.RouteRevisionSubmissions.AsNoTracking().Where(s => s.RouteRevisionId == revisionId)
            .OrderBy(s => s.SubmittedAt).ToArrayAsync(ct);

    public async Task<IReadOnlyList<RouteTestRun>> GetTestRunsAsync(Guid revisionId, CancellationToken ct) =>
        await db.RouteTestRuns.AsNoTracking().Where(r => r.RouteRevisionId == revisionId)
            .OrderBy(r => r.CheckedAt).ThenBy(r => r.Id).ToArrayAsync(ct);

    public async Task<IReadOnlyList<RouteTestRun>> GetTestRunsForRouteAsync(Guid routeId, CancellationToken ct) =>
        await db.RouteTestRuns.AsNoTracking().Where(test =>
            db.RouteRevisions.Any(revision => revision.Id == test.RouteRevisionId && revision.RouteId == routeId))
            .Include(test => test.RouteRevision).ThenInclude(revision => revision.RouteRevisionStops)
            .OrderBy(test => test.CheckedAt).ThenBy(test => test.Id).ToArrayAsync(ct);

    public async Task<PagedResult<Guid>> ListCurrentRevisionIdsAsync(string? search, Guid? mapVersionId,
        string sort, int page, int size, CancellationToken ct)
    {
        var current = db.RouteRevisions.AsNoTracking().Where(revision =>
            db.Routes.Any(route => route.Id == revision.RouteId && route.AuthoringMode == "VERSIONED") &&
            revision.RevisionNumber == db.RouteRevisions.Where(candidate => candidate.RouteId == revision.RouteId)
                .Max(candidate => candidate.RevisionNumber));
        if (search is not null)
            current = current.Where(revision => revision.Name.Contains(search) ||
                (revision.Description != null && revision.Description.Contains(search)));
        if (mapVersionId.HasValue) current = current.Where(revision => revision.MapVersionId == mapVersionId.Value);

        var total = await current.LongCountAsync(ct);
        var ordered = sort switch
        {
            "-name" => current.OrderByDescending(revision => revision.Name),
            "createdAt" => current.OrderBy(revision => revision.CreatedAt),
            "-createdAt" => current.OrderByDescending(revision => revision.CreatedAt),
            _ => current.OrderBy(revision => revision.Name)
        };
        var ids = await ordered.ThenBy(revision => revision.RouteId)
            .Skip((page - 1) * size).Take(size).Select(revision => revision.Id).ToArrayAsync(ct);
        return new PagedResult<Guid>(ids, page, size, total);
    }

    public Task<RouteRevisionSubmission?> FindSubmissionRequestAsync(Guid actorUserId, Guid requestId, CancellationToken ct) =>
        db.RouteRevisionSubmissions.AsNoTracking().SingleOrDefaultAsync(s => s.SubmittedByUserId == actorUserId && s.RequestId == requestId, ct);

    public Task<RouteTestRun?> FindTestRequestAsync(Guid actorUserId, Guid requestId, CancellationToken ct) =>
        db.RouteTestRuns.AsNoTracking().SingleOrDefaultAsync(r => r.CheckedByUserId == actorUserId && r.RequestId == requestId, ct);

    public Task<User?> FindUserAsync(Guid userId, CancellationToken ct) =>
        db.Users.AsNoTracking().Include(u => u.UserRoles).SingleOrDefaultAsync(u => u.Id == userId, ct);

    public async Task<IReadOnlyList<User>> ListActiveStaffUsersAsync(CancellationToken ct) =>
        await db.Users.AsNoTracking().Include(u => u.UserRoles)
            .Where(u => u.IsActive && u.UserRoles.Any(r => r.Role == ApplicationRoles.StaffCode))
            .OrderBy(u => u.FullName).ThenBy(u => u.Id).Take(200).ToArrayAsync(ct);

    public Task<Robot?> FindPhysicalRobotAsync(string robotCode, CancellationToken ct) =>
        db.Robots.AsNoTracking().SingleOrDefaultAsync(r => r.RobotCode == robotCode && r.SourceType == "PHYSICAL", ct);

    public Task LockRobotDeploymentStateAsync(Guid robotId, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = {"map-poi:robot-deployment:" + robotId.ToString("D")},
                @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51022, 'Could not acquire robot deployment state lock.', 1;
            """, ct);

    public Task<MapDeploymentCheck?> GetLatestDeploymentForRobotAsync(Guid robotId, CancellationToken ct) =>
        db.MapDeploymentChecks.AsNoTracking().Where(c => c.RobotId == robotId)
            .OrderByDescending(c => c.CheckedAt).ThenByDescending(c => c.Id).FirstOrDefaultAsync(ct);

    public Task<MapDeploymentCheck?> FindDeploymentAsync(Guid id, CancellationToken ct) =>
        db.MapDeploymentChecks.AsNoTracking().SingleOrDefaultAsync(c => c.Id == id, ct);

    public async Task<IReadOnlyList<RouteRevision>> ListSubmittedPendingAsync(CancellationToken ct) =>
        await db.RouteRevisions.AsNoTracking().Where(r => db.RouteRevisionSubmissions.Any(s => s.RouteRevisionId == r.Id) &&
            !db.RouteTestRuns.Any(test => test.RouteRevisionId == r.Id))
            .OrderBy(r => r.CreatedAt).ThenBy(r => r.Id).Take(100).ToArrayAsync(ct);

    public Task<string?> GetRobotCodeAsync(Guid robotId, CancellationToken ct) =>
        db.Robots.AsNoTracking().Where(r => r.Id == robotId).Select(r => r.RobotCode).SingleOrDefaultAsync(ct);

    public void Add(Route route) => db.Routes.Add(route);
    public void Add(RouteRevision revision) => db.RouteRevisions.Add(revision);
    public void Add(RouteRevisionStop stop) => db.RouteRevisionStops.Add(stop);
    public void Add(RouteRevisionSubmission submission) => db.RouteRevisionSubmissions.Add(submission);
    public void Add(RouteTestRun run) => db.RouteTestRuns.Add(run);
    public void AddAudit(AuditLog audit) => db.AuditLogs.Add(audit);
}
