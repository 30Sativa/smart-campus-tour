using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfVersionedMapPoiRepository(ApplicationDbContext dbContext) : IVersionedMapPoiRepository
{
    public Task FlushAsync(CancellationToken cancellationToken) => dbContext.SaveChangesAsync(cancellationToken);

    public async Task LockRequestAsync(Guid actorUserId, Guid requestId, string operation, CancellationToken cancellationToken)
    {
        var resource = $"map-poi:{operation}:{actorUserId:D}:{requestId:D}";
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = {resource}, @LockMode = N'Exclusive',
                @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51020, 'Could not acquire idempotency lock.', 1;
            """, cancellationToken);
    }

    public Task<MapArea?> LockAreaAsync(string areaKey, CancellationToken cancellationToken) =>
        LockAreaAndReadAsync(areaKey, cancellationToken);

    private async Task<MapArea?> LockAreaAndReadAsync(string areaKey, CancellationToken cancellationToken)
    {
        var resource = $"map-poi:area:{areaKey}";
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = {resource}, @LockMode = N'Exclusive',
                @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51021, 'Could not acquire map area version lock.', 1;
            """, cancellationToken);
        return await dbContext.MapAreas.FromSqlInterpolated($"SELECT * FROM dbo.MapAreas WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE AreaKey = {areaKey}")
            .SingleOrDefaultAsync(cancellationToken);
    }

    public Task<MapArea?> GetAreaAsync(string areaKey, CancellationToken cancellationToken) =>
        dbContext.MapAreas.AsNoTracking().SingleOrDefaultAsync(area => area.AreaKey == areaKey, cancellationToken);

    public Task<MapVersion?> FindMapUploadRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) =>
        dbContext.MapVersions.Include(map => map.AreaKeyNavigation)
            .SingleOrDefaultAsync(map => map.UploadedByUserId == actorUserId && map.UploadRequestId == requestId, cancellationToken);

    public async Task<int> GetNextMapVersionAsync(string areaKey, CancellationToken cancellationToken)
    {
        var current = await dbContext.MapVersions.Where(map => map.AreaKey == areaKey)
            .Select(map => (int?)map.VersionNumber).MaxAsync(cancellationToken);
        return (current ?? 0) + 1;
    }

    public Task<MapVersion?> FindMapVersionAsync(Guid id, bool includePackage, CancellationToken cancellationToken)
    {
        IQueryable<MapVersion> query = dbContext.MapVersions.Include(map => map.AreaKeyNavigation);
        if (!includePackage) query = query.AsNoTracking();
        return query.SingleOrDefaultAsync(map => map.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<MapVersion>> ListMapVersionsAsync(string? areaKey, int take, CancellationToken cancellationToken)
    {
        var query = dbContext.MapVersions.AsNoTracking().Include(map => map.AreaKeyNavigation).AsQueryable();
        if (areaKey is not null) query = query.Where(map => map.AreaKey == areaKey);
        return await query.OrderByDescending(map => map.UploadedAt).ThenBy(map => map.Id).Take(take).ToArrayAsync(cancellationToken);
    }

    public Task<MapDeploymentCheck?> FindDeploymentRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) =>
        dbContext.MapDeploymentChecks.Include(check => check.Robot)
            .SingleOrDefaultAsync(check => check.CheckedByUserId == actorUserId && check.RequestId == requestId, cancellationToken);

    public Task<Robot?> FindPhysicalRobotAsync(string robotCode, CancellationToken cancellationToken) =>
        dbContext.Robots.SingleOrDefaultAsync(robot => robot.RobotCode == robotCode && robot.SourceType == "PHYSICAL", cancellationToken);

    public Task<MapDeploymentCheck?> GetLatestDeploymentCheckAsync(Guid mapVersionId, Guid? robotId, CancellationToken cancellationToken)
    {
        var query = dbContext.MapDeploymentChecks.AsNoTracking().Include(check => check.Robot)
            .Where(check => check.MapVersionId == mapVersionId);
        if (robotId.HasValue) query = query.Where(check => check.RobotId == robotId.Value);
        return query.OrderByDescending(check => check.CheckedAt).ThenByDescending(check => check.Id).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<MapDeploymentCheck>> ListDeploymentChecksAsync(Guid mapVersionId, CancellationToken cancellationToken) =>
        await dbContext.MapDeploymentChecks.AsNoTracking().Include(check => check.Robot)
            .Where(check => check.MapVersionId == mapVersionId)
            .OrderByDescending(check => check.CheckedAt).ThenBy(check => check.Id).ToArrayAsync(cancellationToken);

    public Task<PoiProposal?> LockProposalAsync(Guid proposalId, CancellationToken cancellationToken) =>
        dbContext.PoiProposals.FromSqlInterpolated($"SELECT * FROM dbo.PoiProposals WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE Id = {proposalId}")
            .SingleOrDefaultAsync(cancellationToken);

    public Task<PoiProposal?> FindProposalAsync(Guid proposalId, CancellationToken cancellationToken) =>
        dbContext.PoiProposals.AsNoTracking().SingleOrDefaultAsync(proposal => proposal.Id == proposalId, cancellationToken);

    public Task<PoiProposal?> FindProposalCreateRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) =>
        dbContext.PoiProposals.Include(proposal => proposal.PoiProposalRevisions)
            .ThenInclude(revision => revision.MapVersion).ThenInclude(map => map.AreaKeyNavigation)
            .SingleOrDefaultAsync(proposal => proposal.CreatedByUserId == actorUserId && proposal.CreateRequestId == requestId, cancellationToken);

    public Task<PoiProposalRevision?> FindRevisionRequestAsync(Guid proposalId, Guid requestId, CancellationToken cancellationToken) =>
        dbContext.PoiProposalRevisions.AsNoTracking().Include(revision => revision.MapVersion).ThenInclude(map => map.AreaKeyNavigation)
            .SingleOrDefaultAsync(revision => revision.ProposalId == proposalId && revision.RequestId == requestId, cancellationToken);

    public Task<PoiProposalRevision?> FindCurrentRevisionAsync(Guid proposalId, CancellationToken cancellationToken) =>
        dbContext.PoiProposals.AsNoTracking().Where(proposal => proposal.Id == proposalId)
            .Join(dbContext.PoiProposalRevisions.AsNoTracking(), proposal => new { proposal.Id, proposal.CurrentRevision },
                revision => new { Id = revision.ProposalId, CurrentRevision = revision.RevisionNumber },
                (_, revision) => revision)
            .Include(revision => revision.MapVersion).ThenInclude(map => map.AreaKeyNavigation)
            .SingleOrDefaultAsync(cancellationToken);

    public Task<PoiProposalRevision?> FindRevisionAsync(Guid proposalId, int revisionNumber, CancellationToken cancellationToken) =>
        dbContext.PoiProposalRevisions.AsNoTracking().Include(revision => revision.MapVersion).ThenInclude(map => map.AreaKeyNavigation)
            .SingleOrDefaultAsync(revision => revision.ProposalId == proposalId && revision.RevisionNumber == revisionNumber, cancellationToken);

    public Task<PoiProposalSubmission?> FindSubmissionRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) =>
        dbContext.PoiProposalSubmissions.SingleOrDefaultAsync(submission => submission.SubmittedByUserId == actorUserId && submission.RequestId == requestId, cancellationToken);

    public Task<PoiProposalSubmission?> FindSubmissionAsync(Guid revisionId, CancellationToken cancellationToken) =>
        dbContext.PoiProposalSubmissions.AsNoTracking().SingleOrDefaultAsync(submission => submission.ProposalRevisionId == revisionId, cancellationToken);

    public Task<PoiVerificationRecord?> FindVerificationRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) =>
        dbContext.PoiVerificationRecords.Include(verification => verification.Robot)
            .Include(verification => verification.ProposalRevision).ThenInclude(revision => revision.MapVersion)
                .ThenInclude(map => map.AreaKeyNavigation)
            .SingleOrDefaultAsync(verification => verification.CheckedByUserId == actorUserId && verification.RequestId == requestId, cancellationToken);

    public Task<PoiVerificationRecord?> FindVerificationAsync(Guid revisionId, CancellationToken cancellationToken) =>
        dbContext.PoiVerificationRecords.AsNoTracking().Include(verification => verification.ProposalRevision)
            .SingleOrDefaultAsync(verification => verification.ProposalRevisionId == revisionId, cancellationToken);

    public Task<PoiVerificationRecord?> FindLatestVerificationByFingerprintAsync(Guid proposalId, byte[] fingerprint, CancellationToken cancellationToken) =>
        dbContext.PoiVerificationRecords.AsNoTracking()
            .Where(verification => verification.ProposalRevision.ProposalId == proposalId &&
                                   verification.NavigationFingerprint == fingerprint)
            .OrderByDescending(verification => verification.CheckedAt).ThenByDescending(verification => verification.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiProposalRevision>> ListRevisionsAsync(Guid proposalId, CancellationToken cancellationToken) =>
        await dbContext.PoiProposalRevisions.AsNoTracking().Include(revision => revision.MapVersion).ThenInclude(map => map.AreaKeyNavigation)
            .Include(revision => revision.PoiProposalSubmission)
            .Where(revision => revision.ProposalId == proposalId)
            .OrderBy(revision => revision.RevisionNumber).ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiVerificationRecord>> ListVerificationRecordsAsync(Guid proposalId, CancellationToken cancellationToken) =>
        await dbContext.PoiVerificationRecords.AsNoTracking().Include(verification => verification.ProposalRevision)
            .ThenInclude(revision => revision.MapVersion).Include(verification => verification.Robot)
            .Where(verification => verification.ProposalRevision.ProposalId == proposalId)
            .OrderBy(verification => verification.CheckedAt).ThenBy(verification => verification.Id).ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiProposal>> ListProposalsAsync(Guid? mapVersionId, CancellationToken cancellationToken)
    {
        var query = dbContext.PoiProposals.AsNoTracking().AsQueryable();
        if (mapVersionId.HasValue)
            query = query.Where(proposal => dbContext.PoiProposalRevisions.Any(revision =>
                revision.ProposalId == proposal.Id && revision.RevisionNumber == proposal.CurrentRevision &&
                revision.MapVersionId == mapVersionId.Value));
        return await query.OrderByDescending(proposal => proposal.UpdatedAt ?? proposal.CreatedAt)
            .ThenBy(proposal => proposal.Id).Take(100).ToArrayAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PoiProposalRevision>> ListSubmittedVerificationQueueAsync(Guid? mapVersionId, CancellationToken cancellationToken)
    {
        var query = dbContext.PoiProposalRevisions.AsNoTracking()
            .Include(revision => revision.Proposal)
            .Include(revision => revision.MapVersion).ThenInclude(map => map.AreaKeyNavigation)
            .Where(revision => revision.RevisionNumber == revision.Proposal.CurrentRevision &&
                               dbContext.PoiProposalSubmissions.Any(submission => submission.ProposalRevisionId == revision.Id) &&
                               !dbContext.PoiVerificationRecords.Any(verification => verification.ProposalRevisionId == revision.Id) &&
                               !dbContext.PoiVerificationRecords.Any(verification =>
                                   verification.ProposalRevision.ProposalId == revision.ProposalId &&
                                   verification.NavigationFingerprint == revision.NavigationFingerprint &&
                                   verification.ResultCode == "PASS"));
        if (mapVersionId.HasValue) query = query.Where(revision => revision.MapVersionId == mapVersionId.Value);
        return await query.OrderBy(revision => revision.CreatedAt).ThenBy(revision => revision.ProposalId)
            .Take(100).ToArrayAsync(cancellationToken);
    }

    public void Add(MapArea area) => dbContext.MapAreas.Add(area);
    public void Add(MapVersion mapVersion) => dbContext.MapVersions.Add(mapVersion);
    public void Add(MapDeploymentCheck deploymentCheck) => dbContext.MapDeploymentChecks.Add(deploymentCheck);
    public void Add(PoiProposal proposal) => dbContext.PoiProposals.Add(proposal);
    public void Add(PoiProposalRevision revision) => dbContext.PoiProposalRevisions.Add(revision);
    public void Add(PoiProposalSubmission submission) => dbContext.PoiProposalSubmissions.Add(submission);
    public void Add(PoiVerificationRecord verification) => dbContext.PoiVerificationRecords.Add(verification);
    public void AddAuditLog(AuditLog auditLog) => dbContext.AuditLogs.Add(auditLog);
}
