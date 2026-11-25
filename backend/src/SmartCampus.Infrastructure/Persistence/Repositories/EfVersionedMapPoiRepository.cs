using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Infrastructure.Persistence.Repositories;

public sealed class EfVersionedMapPoiRepository(ApplicationDbContext dbContext) :
    IMapPoiRequestLock, IMapVersionRepository, IPoiProposalRepository, IPoiVerificationRepository, IPoiImportRepository
{
    public async Task<IReadOnlyList<MapArea>> ListMapAreasAsync(CancellationToken cancellationToken) =>
        await dbContext.MapAreas.AsNoTracking()
            .OrderBy(area => area.DisplayName).ThenBy(area => area.AreaKey)
            .ToArrayAsync(cancellationToken);

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

    public Task LockNewAreaNamesAsync(CancellationToken cancellationToken) =>
        dbContext.Database.ExecuteSqlRawAsync("""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = N'map-poi:new-area-names', @LockMode = N'Exclusive',
                @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51021, 'Could not acquire new map area name lock.', 1;
            """, cancellationToken);

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

    public async Task<int?> FindVersionNumberByPackageAsync(string areaKey, byte[] packageSha256, CancellationToken cancellationToken) =>
        await dbContext.MapVersions.AsNoTracking()
            .Where(map => map.AreaKey == areaKey && map.PackageSha256 == packageSha256)
            .Select(map => (int?)map.VersionNumber)
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<int> GetNextMapVersionAsync(string areaKey, CancellationToken cancellationToken)
    {
        var current = await dbContext.MapVersions.Where(map => map.AreaKey == areaKey)
            .Select(map => (int?)map.VersionNumber).MaxAsync(cancellationToken);
        return (current ?? 0) + 1;
    }

    public Task<MapVersion?> FindMapVersionAsync(Guid id, bool includePackage, CancellationToken cancellationToken)
    {
        IQueryable<MapVersion> query = dbContext.MapVersions.Include(map => map.AreaKeyNavigation).Include(map => map.RetiredByUser);
        if (!includePackage) query = query.AsNoTracking();
        return query.SingleOrDefaultAsync(map => map.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<MapVersion>> ListMapVersionsAsync(string? areaKey, int take, bool includeRetired, CancellationToken cancellationToken)
    {
        var query = dbContext.MapVersions.AsNoTracking().Include(map => map.AreaKeyNavigation).Include(map => map.RetiredByUser).AsQueryable();
        // Pickers never offer a retired version (ADR-0041); Map Management asks for them explicitly.
        if (!includeRetired) query = query.Where(map => map.RetiredAt == null);
        if (areaKey is not null) query = query.Where(map => map.AreaKey == areaKey);
        return await query.OrderByDescending(map => map.UploadedAt).ThenBy(map => map.Id).Take(take).ToArrayAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<MapDeploymentCheck>> ListLatestDeploymentChecksForPhysicalRobotsAsync(CancellationToken cancellationToken) =>
        await LatestPhysicalRobotDeploymentChecks.Query(dbContext).ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<Robot>> ListAssignedPhysicalRobotsAsync(CancellationToken cancellationToken) =>
        await MapVersionLabels.WithAssignedMapsAsync(dbContext, await dbContext.Robots.AsNoTracking()
            .Where(robot => robot.SourceType == "PHYSICAL" && robot.DeactivatedAt == null && robot.AssignedMapVersionId != null)
            .ToArrayAsync(cancellationToken), cancellationToken);

    public async Task<Robot?> ReadRobotForReadinessAsync(Guid robotId, CancellationToken cancellationToken) =>
        await MapVersionLabels.WithAssignedMapAsync(dbContext, await dbContext.Robots.AsNoTracking()
            .SingleOrDefaultAsync(robot => robot.Id == robotId && robot.SourceType == "PHYSICAL", cancellationToken), cancellationToken);

    public Task<MapDeploymentCheck?> FindDeploymentRequestAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) =>
        dbContext.MapDeploymentChecks.Include(check => check.Robot)
            .SingleOrDefaultAsync(check => check.CheckedByUserId == actorUserId && check.RequestId == requestId, cancellationToken);

    public Task<Robot?> FindPhysicalRobotAsync(string robotCode, CancellationToken cancellationToken) =>
        dbContext.Robots.SingleOrDefaultAsync(robot => robot.RobotCode == robotCode && robot.SourceType == "PHYSICAL", cancellationToken);

    public Task LockRobotDeploymentStateAsync(Guid robotId, CancellationToken cancellationToken)
    {
        var resource = $"map-poi:robot-deployment:{robotId:D}";
        return dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = {resource}, @LockMode = N'Exclusive',
                @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51022, 'Could not acquire robot deployment state lock.', 1;
            """, cancellationToken);
    }

    public Task<bool> LockAndReadConnectionConfirmationAsync(Guid robotId, CancellationToken cancellationToken) =>
        dbContext.Robots
            .FromSqlInterpolated($"SELECT * FROM dbo.Robots WITH (UPDLOCK, HOLDLOCK) WHERE Id = {robotId}")
            .AsNoTracking()
            .Select(robot => robot.FirstAcceptedSyncAt != null)
            .SingleOrDefaultAsync(cancellationToken);

    public Task LockMapPreparationStateAsync(Guid mapVersionId, CancellationToken cancellationToken)
    {
        var resource = $"map-poi:map-preparation:{mapVersionId:D}";
        return dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @lockResult int;
            EXEC @lockResult = sys.sp_getapplock @Resource = {resource}, @LockMode = N'Exclusive',
                @LockOwner = N'Transaction', @LockTimeout = 10000;
            IF @lockResult < 0 THROW 51023, 'Could not acquire map preparation state lock.', 1;
            """, cancellationToken);
    }

    public async Task<bool> IsMapVersionRetiredAsync(Guid mapVersionId, CancellationToken cancellationToken) =>
        await dbContext.MapVersions.AsNoTracking().Where(map => map.Id == mapVersionId)
            .Select(map => map.RetiredAt != null).SingleOrDefaultAsync(cancellationToken);

    public async Task<(bool Found, DateTimeOffset? RetiredAt)> LockMapVersionRowAsync(Guid mapVersionId, CancellationToken cancellationToken)
    {
        // Column-limited so the lock never reads the package bytes.
        var rows = await dbContext.Database.SqlQuery<MapRetirementRow>($"""
            SELECT Id, RetiredAt FROM dbo.MapVersions WITH (UPDLOCK, HOLDLOCK, ROWLOCK) WHERE Id = {mapVersionId}
            """).ToListAsync(cancellationToken);
        return rows.Count == 0 ? (false, null) : (true, rows[0].RetiredAt);
    }

    public Task SetMapVersionRetirementAsync(Guid mapVersionId, DateTimeOffset? retiredAt, Guid? retiredByUserId, string? reason,
        CancellationToken cancellationToken) =>
        // The runtime may update only these three columns of a stored map version.
        dbContext.MapVersions.Where(map => map.Id == mapVersionId).ExecuteUpdateAsync(setters => setters
            .SetProperty(map => map.RetiredAt, retiredAt)
            .SetProperty(map => map.RetiredByUserId, retiredByUserId)
            .SetProperty(map => map.RetirementReason, reason), cancellationToken);

    public async Task<MapRetirementImpact> GetMapRetirementImpactAsync(Guid mapVersionId, CancellationToken cancellationToken)
    {
        var routes = await dbContext.Routes.AsNoTracking()
            .Where(route => dbContext.RouteRevisions.Any(revision => revision.RouteId == route.Id && revision.MapVersionId == mapVersionId))
            .OrderBy(route => route.Name).ThenBy(route => route.Id)
            .ToArrayAsync(cancellationToken);
        var robots = await dbContext.Robots.AsNoTracking()
            .Where(robot => robot.AssignedMapVersionId == mapVersionId && robot.DeactivatedAt == null)
            .OrderBy(robot => robot.RobotCode)
            .Select(robot => new MapRetirementRobot(robot.Id, robot.RobotCode))
            .ToArrayAsync(cancellationToken);
        // The same rule as the Technical POI and route queues: submitted and still waiting for a result.
        var pendingPois = (await ListSubmittedVerificationQueueAsync(mapVersionId, cancellationToken))
            .Select(revision => new MapRetirementPendingPoi(revision.ProposalId, revision.Name, revision.RevisionNumber))
            .ToArray();
        var pendingRoutes = await dbContext.RouteRevisions.AsNoTracking()
            .Where(revision => revision.MapVersionId == mapVersionId &&
                dbContext.RouteRevisionSubmissions.Any(submission => submission.RouteRevisionId == revision.Id) &&
                !dbContext.RouteTestRuns.Any(run => run.RouteRevisionId == revision.Id))
            .OrderBy(revision => revision.CreatedAt).ThenBy(revision => revision.Id)
            .Select(revision => new MapRetirementPendingRoute(revision.RouteId, revision.Id, revision.Name, revision.RevisionNumber))
            .ToArrayAsync(cancellationToken);
        var tours = await dbContext.Tours.AsNoTracking()
            .Where(tour => (tour.State == "SCHEDULED" || tour.State == "READY") &&
                tour.RouteRevision != null && tour.RouteRevision.MapVersionId == mapVersionId)
            .OrderBy(tour => tour.ScheduledStartAt).ThenBy(tour => tour.Id)
            .Select(tour => new MapRetirementTour(tour.Id, tour.Name, tour.ScheduledStartAt, tour.State))
            .ToArrayAsync(cancellationToken);
        return new(mapVersionId,
            routes.Select(route => new MapRetirementRoute(route.Id, route.Name, route.IsOpenForNewTours)).ToArray(),
            robots, pendingPois, pendingRoutes, tours);
    }

    private sealed class MapRetirementRow
    {
        public Guid Id { get; init; }
        public DateTimeOffset? RetiredAt { get; init; }
    }

    public async Task<MapDeploymentCheck?> GetLatestDeploymentCheckForRobotAsync(Guid robotId, CancellationToken cancellationToken) =>
        await MapVersionLabels.WithMapAsync(dbContext, await dbContext.MapDeploymentChecks.AsNoTracking().Include(check => check.Robot)
            .Where(check => check.RobotId == robotId)
            .OrderByDescending(check => check.CheckedAt).ThenByDescending(check => check.Id)
            .FirstOrDefaultAsync(cancellationToken), cancellationToken);

    public Task<MapDeploymentCheck?> GetLatestDeploymentCheckAsync(Guid mapVersionId, Guid? robotId, CancellationToken cancellationToken)
    {
        var query = dbContext.MapDeploymentChecks.AsNoTracking().Include(check => check.Robot)
            .Where(check => check.MapVersionId == mapVersionId);
        if (robotId.HasValue) query = query.Where(check => check.RobotId == robotId.Value);
        return query.OrderByDescending(check => check.CheckedAt).ThenByDescending(check => check.Id).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<MapDeploymentCheck>> ListDeploymentChecksForMapAsync(Guid mapVersionId, CancellationToken cancellationToken) =>
        await dbContext.MapDeploymentChecks.AsNoTracking().Include(check => check.Robot)
            .Where(check => check.MapVersionId == mapVersionId)
            .OrderByDescending(check => check.CheckedAt).ThenByDescending(check => check.Id)
            .ToArrayAsync(cancellationToken);

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
            .OrderByDescending(verification => verification.ProposalRevision.RevisionNumber)
            .ThenByDescending(verification => verification.CheckedAt).ThenByDescending(verification => verification.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiProposalRevision>> ListRevisionsAsync(Guid proposalId, CancellationToken cancellationToken) =>
        await dbContext.PoiProposalRevisions.AsNoTracking().Include(revision => revision.MapVersion).ThenInclude(map => map.AreaKeyNavigation)
            .Include(revision => revision.PoiProposalSubmission)
            .Where(revision => revision.ProposalId == proposalId)
            .OrderBy(revision => revision.RevisionNumber).ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiVerificationRecord>> ListVerificationRecordsAsync(IReadOnlyCollection<Guid> proposalIds, CancellationToken cancellationToken) =>
        await dbContext.PoiVerificationRecords.AsNoTracking().Include(verification => verification.ProposalRevision)
            .ThenInclude(revision => revision.MapVersion).Include(verification => verification.Robot)
            .Where(verification => proposalIds.Contains(verification.ProposalRevision.ProposalId))
            .OrderBy(verification => verification.CheckedAt).ThenBy(verification => verification.Id).ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiProposal>> ListProposalsAsync(Guid? mapVersionId, CancellationToken cancellationToken)
    {
        // Discarded proposals (ADR-0051) stay readable by id and history, but leave every working list.
        var query = dbContext.PoiProposals.AsNoTracking().Where(proposal => proposal.DiscardedAt == null);
        if (mapVersionId.HasValue)
            query = query.Where(proposal => dbContext.PoiProposalRevisions.Any(revision =>
                revision.ProposalId == proposal.Id && revision.RevisionNumber == proposal.CurrentRevision &&
                revision.MapVersionId == mapVersionId.Value));
        return await query.OrderByDescending(proposal => proposal.UpdatedAt ?? proposal.CreatedAt)
            .ThenBy(proposal => proposal.Id).Take(100).ToArrayAsync(cancellationToken);
    }

    public async Task<IReadOnlySet<Guid>> ListProposalsUsedInRoutesAsync(IReadOnlyCollection<Guid> proposalIds,
        CancellationToken cancellationToken) =>
        proposalIds.Count == 0 ? new HashSet<Guid>() : (await dbContext.RouteRevisionStops.AsNoTracking()
            .Where(stop => proposalIds.Contains(stop.PoiProposalRevision.ProposalId))
            .Select(stop => stop.PoiProposalRevision.ProposalId).Distinct().ToArrayAsync(cancellationToken)).ToHashSet();

    // The same projection as the route's scheduled-tours list (EfRouteRevisionRepository.ListScheduledToursAsync).
    public async Task<IReadOnlyList<Application.Features.Routes.RouteScheduledTourView>> ListScheduledToursUsingAsync(Guid proposalId,
        CancellationToken cancellationToken) =>
        await dbContext.Tours.AsNoTracking()
            .Where(tour => (tour.State == "SCHEDULED" || tour.State == "READY") && tour.RouteRevisionId != null &&
                dbContext.RouteRevisionStops.Any(stop => stop.RouteRevisionId == tour.RouteRevisionId &&
                    stop.PoiProposalRevision.ProposalId == proposalId))
            .OrderBy(tour => tour.ScheduledStartAt).ThenBy(tour => tour.Id)
            .Select(tour => new Application.Features.Routes.RouteScheduledTourView(tour.Id, tour.Name, tour.ScheduledStartAt, tour.State,
                tour.IsShortNotice ? tour.ScheduledStartAt : tour.ScheduledStartAt.AddHours(-Application.Features.Tours.TourSchedule.RegistrationCloseHours),
                tour.IsShortNotice))
            .ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiProposalRevision>> ListCurrentRevisionsAsync(
        IReadOnlyCollection<Guid> proposalIds, CancellationToken cancellationToken) =>
        await dbContext.PoiProposalRevisions.AsNoTracking()
            .Include(revision => revision.MapVersion).ThenInclude(map => map.AreaKeyNavigation)
            .Include(revision => revision.PoiProposalSubmission)
            .Where(revision => proposalIds.Contains(revision.ProposalId) &&
                revision.RevisionNumber == revision.Proposal.CurrentRevision)
            .ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiProposalRevision>> ListSubmittedVerificationQueueAsync(Guid? mapVersionId, CancellationToken cancellationToken)
    {
        var query = dbContext.PoiProposalRevisions.AsNoTracking()
            .Include(revision => revision.Proposal)
            .Include(revision => revision.MapVersion).ThenInclude(map => map.AreaKeyNavigation)
            .Include(revision => revision.PoiProposalSubmission)
            .Where(revision => revision.RevisionNumber == revision.Proposal.CurrentRevision &&
                               revision.Proposal.DiscardedAt == null &&
                               revision.Proposal.RetiredAt == null &&
                               dbContext.PoiProposalSubmissions.Any(submission => submission.ProposalRevisionId == revision.Id) &&
                               !dbContext.PoiVerificationRecords.Any(verification => verification.ProposalRevisionId == revision.Id) &&
                               !dbContext.PoiVerificationRecords
                                   .Where(verification => verification.ProposalRevision.ProposalId == revision.ProposalId &&
                                                          verification.NavigationFingerprint == revision.NavigationFingerprint)
                                   .OrderByDescending(verification => verification.ProposalRevision.RevisionNumber)
                                   .Select(verification => verification.ResultCode)
                                   .Take(1)
                                   .Contains("PASS"));
        if (mapVersionId.HasValue) query = query.Where(revision => revision.MapVersionId == mapVersionId.Value);
        return await query.OrderBy(revision => revision.CreatedAt).ThenBy(revision => revision.ProposalId)
            .Take(100).ToArrayAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PoiImportReceipt>> ListImportRequestReceiptsAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) =>
        await dbContext.PoiImportReceipts.AsNoTracking()
            .Where(receipt => receipt.ImportedByUserId == actorUserId && receipt.RequestId == requestId)
            .OrderBy(receipt => receipt.FileName).ThenBy(receipt => receipt.Id).ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiImportReceipt>> ListAppliedImportReceiptsAsync(Guid mapVersionId, CancellationToken cancellationToken) =>
        await dbContext.PoiImportReceipts.AsNoTracking()
            .Where(receipt => receipt.MapVersionId == mapVersionId && receipt.Action != PoiImportActions.NoChange)
            .ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiProposal>> ListProposalsBySourceAsync(string areaKey, IReadOnlyCollection<string> sourcePoiIds, CancellationToken cancellationToken) =>
        await dbContext.PoiProposals.AsNoTracking()
            .Where(proposal => proposal.SourceAreaKey == areaKey && sourcePoiIds.Contains(proposal.SourcePoiId!))
            .ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyDictionary<Guid, string>> ListCurrentCameraPresetsAsync(IReadOnlyCollection<Guid> proposalIds, CancellationToken cancellationToken) =>
        await dbContext.PoiProposals.AsNoTracking()
            .Where(proposal => proposalIds.Contains(proposal.Id))
            .Join(dbContext.PoiProposalRevisions,
                proposal => new { ProposalId = proposal.Id, RevisionNumber = proposal.CurrentRevision },
                revision => new { revision.ProposalId, revision.RevisionNumber },
                (proposal, revision) => new { proposal.Id, revision.CameraPreset })
            .ToDictionaryAsync(row => row.Id, row => row.CameraPreset, cancellationToken);

    public async Task<IReadOnlyList<PoiNarrationRevision>> ListNarrationsAsync(Guid proposalId, CancellationToken cancellationToken) =>
        await NarrationsWithUsers().Where(narration => narration.ProposalId == proposalId)
            .OrderByDescending(narration => narration.RevisionNumber).ToArrayAsync(cancellationToken);

    public async Task<IReadOnlyList<PoiNarrationRevision>> ListCurrentNarrationsAsync(
        IReadOnlyCollection<Guid> proposalIds, CancellationToken cancellationToken) =>
        await NarrationsWithUsers()
            .Where(narration => proposalIds.Contains(narration.ProposalId) &&
                (narration.State == PoiNarrationStates.Draft || narration.State == PoiNarrationStates.Approved))
            .ToArrayAsync(cancellationToken);

    public Task<PoiNarrationRevision?> FindNarrationAsync(Guid proposalId, int revisionNumber, CancellationToken cancellationToken) =>
        dbContext.PoiNarrationRevisions.SingleOrDefaultAsync(
            narration => narration.ProposalId == proposalId && narration.RevisionNumber == revisionNumber, cancellationToken);

    public Task<PoiNarrationRevision?> FindNarrationInStateAsync(Guid proposalId, string state, CancellationToken cancellationToken) =>
        dbContext.PoiNarrationRevisions.SingleOrDefaultAsync(
            narration => narration.ProposalId == proposalId && narration.State == state, cancellationToken);

    public async Task<int> GetLastNarrationNumberAsync(Guid proposalId, CancellationToken cancellationToken) =>
        await dbContext.PoiNarrationRevisions.Where(narration => narration.ProposalId == proposalId)
            .Select(narration => (int?)narration.RevisionNumber).MaxAsync(cancellationToken) ?? 0;

    public Task<PoiNarrationRevision?> GetNarrationForViewAsync(Guid narrationId, CancellationToken cancellationToken) =>
        NarrationsWithUsers().SingleOrDefaultAsync(narration => narration.Id == narrationId, cancellationToken);

    public Task<PoiNarrationRequestReceipt?> FindNarrationReceiptAsync(Guid actorUserId, Guid requestId, CancellationToken cancellationToken) =>
        dbContext.PoiNarrationRequestReceipts.AsNoTracking()
            .SingleOrDefaultAsync(receipt => receipt.ActorUserId == actorUserId && receipt.RequestId == requestId, cancellationToken);

    private IQueryable<PoiNarrationRevision> NarrationsWithUsers() =>
        dbContext.PoiNarrationRevisions.AsNoTracking()
            .Include(narration => narration.CreatedByUser)
            .Include(narration => narration.LastEditedByUser)
            .Include(narration => narration.ApprovedByUser);

    public void Add(PoiNarrationRevision narration) => dbContext.PoiNarrationRevisions.Add(narration);
    public void Add(PoiNarrationRequestReceipt receipt) => dbContext.PoiNarrationRequestReceipts.Add(receipt);
    public void Add(PoiImportReceipt receipt) => dbContext.PoiImportReceipts.Add(receipt);
    public void Add(MapArea area) => dbContext.MapAreas.Add(area);
    public void Add(MapVersion mapVersion) => dbContext.MapVersions.Add(mapVersion);
    public void Add(MapDeploymentCheck deploymentCheck) => dbContext.MapDeploymentChecks.Add(deploymentCheck);
    public void Add(PoiProposal proposal) => dbContext.PoiProposals.Add(proposal);
    public void Add(PoiProposalRevision revision) => dbContext.PoiProposalRevisions.Add(revision);
    public void Add(PoiProposalSubmission submission) => dbContext.PoiProposalSubmissions.Add(submission);
    public void Add(PoiVerificationRecord verification) => dbContext.PoiVerificationRecords.Add(verification);
    public void AddAuditLog(AuditLog auditLog) => dbContext.AuditLogs.Add(auditLog);
}
