using SmartCampus.Domain.Entities;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Routes;

public sealed record RouteRevisionStopInput(Guid PoiRevisionId, int DwellSeconds, IReadOnlyList<RouteHeadStep> HeadSteps);
public sealed record RouteRevisionDraftInput(
    Guid RequestId, int ExpectedCurrentRevision, string Name, string? Description, Guid MapVersionId,
    decimal StartX, decimal StartY, decimal StartYaw, string EndMode,
    decimal? EndX, decimal? EndY, decimal? EndYaw,
    IReadOnlyList<RouteRevisionStopInput> Stops,
    // ADR-0065 "Cho Viewer chọn điểm tiếp theo": 3-4 POIs, the first fixed, dwell >= 30 s, the end back at the start.
    bool ViewerChoosesNextStop = false);
public sealed record RouteRevisionRequest(Guid RequestId, int ExpectedCurrentRevision);
public sealed record RouteRunRequest(
    Guid RequestId, string RobotCode, Guid ParticipatingStaffUserId,
    string ResultCode, bool AllStopsReached, bool SafelyStopped, bool LocalizationPassed,
    string? FailureReason, string EvidenceNote,
    // ADR-0065: the revision stop ids in the order driven; required on a voting route, ignored on a fixed one.
    IReadOnlyList<Guid>? TraversedStopIds = null,
    // ADR-0072: 0-5 photos this checker uploaded with POST api/technical/evidence-photo-upload.
    IReadOnlyList<string>? EvidencePhotoUrls = null);
/// <summary>ADR-0065: how many of a voting route's legs the PASS runs since the newest FAIL have driven.</summary>
public sealed record RouteLegCoverageView(int RequiredCount, int CoveredCount, IReadOnlyList<RouteMissingLegView> MissingLegs);
/// <summary>A leg no PASS run has driven yet. <c>FromStopId</c> null is the start, <c>ToStopId</c> null the end.</summary>
public sealed record RouteMissingLegView(Guid? FromStopId, string FromName, Guid? ToStopId, string ToName);

/// <summary>One stop of a revision. <c>Id</c> is the <c>RouteRevisionStops.Id</c> that a Tour's execution stop ids name.</summary>
public sealed record RouteRevisionStopView(Guid Id, Guid PoiRevisionId, Guid SourcePoiVerificationRecordId,
    int StopOrder, int DwellSeconds, IReadOnlyList<RouteHeadStep> HeadSteps,
    string Name, decimal X, decimal Y, decimal Yaw, string CameraPreset,
    string? NarrationText = null, string? FallbackVideoUrl = null,
    // ADR-0061: the POI the stop's revision belongs to, so a reader can find that POI's newer revisions.
    Guid? PoiProposalId = null,
    // ADR-0060: the POI's approved narration version when it is not the one this stop saved; null when the stop has it.
    int? NewerNarrationRevisionNumber = null);
/// <summary>
/// One recorded run. Since nobody types a duration, <c>MeasuredDurationSeconds</c> holds the estimate stored when it was
/// recorded (older runs keep what was typed); screens no longer show it. It and <c>MeasurementBasis</c> go with the columns
/// in a later schema version.
/// </summary>
public sealed record RouteTestRunView(Guid Id, Guid RouteRevisionId, Guid MapVersionId, string MapPackageSha256,
    string RobotCode, Guid CheckedByUserId, Guid ParticipatingStaffUserId, string ResultCode,
    bool AllStopsReached, bool SafelyStopped, bool LocalizationPassed, int MeasuredDurationSeconds,
    string? FailureReason, string EvidenceNote, DateTimeOffset CheckedAt, string? MeasurementBasis,
    // Names for the Staff fail banner; null for a deleted account or a view built before the names were read.
    string? CheckedByName = null, string? ParticipatingStaffName = null,
    // ADR-0065: the revision stop ids in the order driven, recorded on a voting route; null on a fixed one.
    IReadOnlyList<Guid>? TraversedStopIds = null,
    // ADR-0072: the evidence photos' Cloudinary URLs; empty when the run has none.
    IReadOnlyList<string>? EvidencePhotoUrls = null);
/// <summary>
/// Another submitted save of the same route with the same path (map, start, end, stop POIs and order, head steps): the
/// newest run on any of them is their applied result (ADR-0023 addendum), so recording one changes them all.
/// </summary>
public sealed record RouteSharedResultRevisionView(Guid RevisionId, int RevisionNumber, DateTimeOffset CreatedAt,
    IReadOnlyList<RouteScheduledTourView> ScheduledTours);
/// <summary>What a route test measured. A run without a basis predates ADR-0035 and cannot size a reservation.</summary>
public static class RouteMeasurementBasis { public const string TotalWithDwell = "TOTAL_WITH_DWELL"; }
public sealed record RouteTestParticipantView(Guid UserId, string FullName, string Username);
public sealed record RouteRevisionSummaryView(Guid RevisionId, int RevisionNumber, Guid MapVersionId,
    string MapPackageSha256, string ConfigurationFingerprint, bool IsSubmitted, string VerificationStatus,
    Guid? EffectiveTestRunId, DateTimeOffset CreatedAt,
    // ADR-0065: VerificationStatus may then be LEGS_INCOMPLETE; LegCoverage is null on a fixed route.
    bool ViewerChoosesNextStop = false, RouteLegCoverageView? LegCoverage = null);
public sealed record RouteRevisionView(Guid RouteId, Guid RevisionId, int RevisionNumber, string Name,
    string? Description, Guid MapVersionId, string MapKey, string MapPackageSha256,
    decimal StartX, decimal StartY, decimal StartYaw, string EndMode, decimal? EndX, decimal? EndY,
    decimal? EndYaw, string ConfigurationFingerprint, bool IsSubmitted, string VerificationStatus,
    Guid? EffectiveTestRunId, string DurationStatus, int DwellDurationSeconds,
    IReadOnlyList<RouteRevisionStopView> Stops, IReadOnlyList<RouteTestRunView> TestRuns,
    IReadOnlyList<RouteRevisionSummaryView> RevisionHistory, IReadOnlyList<string> EligibilityIssues,
    bool IsActive = true, string RowVersion = "",
    // docs/lich-tour-theo-ca.md §4: kept apart from EligibilityIssues, which READY reads as stale POI evidence.
    string ScheduleFit = "UNKNOWN", int? ExpectedDurationSeconds = null,
    // ADR-0062: names of the stops whose POI is retired or discarded now. A new Tour is refused on such a revision.
    IReadOnlyList<string>? RetiredPoiNames = null,
    // ADR-0023 addendum: the other submitted saves the applied result also covers, and the Tours still to run on this save.
    IReadOnlyList<RouteSharedResultRevisionView>? SharedResultRevisions = null,
    IReadOnlyList<RouteScheduledTourView>? ScheduledTours = null,
    // ADR-0065: a voting route; VerificationStatus may then be LEGS_INCOMPLETE. LegCoverage is null on a fixed route.
    bool ViewerChoosesNextStop = false, RouteLegCoverageView? LegCoverage = null);
public sealed record RouteAvailabilityRequest(Guid RequestId, string ExpectedRowVersion);
/// <summary>A SCHEDULED or READY Tour on the route; the close of registration lets Staff screens label a quick Tour right.</summary>
public sealed record RouteScheduledTourView(Guid Id, string Name, DateTimeOffset ScheduledStartAt, string State,
    DateTimeOffset? RegistrationClosesAt = null, bool IsShortNotice = false, Guid? RouteRevisionId = null);
public sealed record RouteAvailabilityResult(Guid RouteId, bool IsActive, IReadOnlyList<RouteScheduledTourView> ScheduledTours);

public sealed record RoutePoiRevisionEvidence(PoiProposalRevision Revision, PoiVerificationRecord Verification);

public sealed record RouteNavigationStopConfiguration(int StopOrder, byte[] PoiNavigationFingerprint,
    string CameraPreset, IReadOnlyList<RouteHeadStep> HeadSteps);
public sealed record RouteNavigationConfiguration(Guid MapVersionId, byte[] MapPackageSha256,
    decimal StartX, decimal StartY, decimal StartYaw, string EndMode, decimal? EndX, decimal? EndY,
    decimal? EndYaw, IReadOnlyList<RouteNavigationStopConfiguration> Stops,
    // ADR-0065: switching the vote flag changes the path, so it needs its own test runs.
    bool ViewerChoosesNextStop = false);

public interface IRouteRevisionRepository
{
    Task LockRequestAsync(Guid actorUserId, Guid requestId, string operation, CancellationToken ct);
    Task<RouteRevision?> FindRequestAsync(Guid actorUserId, Guid requestId, CancellationToken ct);
    Task<Route?> LockRouteAsync(Guid routeId, CancellationToken ct);
    Task<Route?> FindRouteAsync(Guid routeId, CancellationToken ct);
    Task<RouteRevision?> FindRevisionAsync(Guid revisionId, CancellationToken ct);
    Task<RouteRevision?> FindRevisionRequestAsync(Guid routeId, Guid actorUserId, Guid requestId, CancellationToken ct);
    Task<RouteRevision?> GetCurrentRevisionAsync(Guid routeId, CancellationToken ct);
    Task<IReadOnlyList<RouteRevision>> GetRevisionsAsync(Guid routeId, bool submittedOnly, CancellationToken ct);
    Task<MapVersion?> GetMapAsync(Guid mapVersionId, CancellationToken ct);
    Task<IReadOnlyList<RoutePoiRevisionEvidence>> GetPoiEvidenceAsync(IReadOnlyCollection<Guid> revisionIds, CancellationToken ct);
    Task<PoiVerificationRecord?> GetEffectivePoiVerificationAsync(Guid proposalId, byte[] fingerprint, CancellationToken ct);
    /// <summary>The current APPROVED narration of each of these POI proposals that has one (ADR-0060).</summary>
    Task<IReadOnlyList<PoiNarrationRevision>> GetApprovedNarrationsAsync(IReadOnlyCollection<Guid> proposalIds, CancellationToken ct);
    /// <summary>Untracked revisions with these ids; unknown ids are left out.</summary>
    Task<IReadOnlyList<PoiProposalRevision>> FindPoiRevisionsAsync(IReadOnlyCollection<Guid> revisionIds, CancellationToken ct);
    /// <summary>
    /// UPDLOCK/HOLDLOCK row locks on these POI proposals, taken one at a time in Guid order like the pose import, so a
    /// concurrent discard or retire of one of them serializes with the route save (ADR-0062).
    /// </summary>
    Task<IReadOnlyDictionary<Guid, PoiProposal>> LockPoiProposalsAsync(IReadOnlyCollection<Guid> proposalIds, CancellationToken ct);
    /// <summary>Untracked proposals with these ids, discarded or retired ones included.</summary>
    Task<IReadOnlyList<PoiProposal>> FindPoiProposalsAsync(IReadOnlyCollection<Guid> proposalIds, CancellationToken ct);
    Task<PoiProposalRevision?> FindPoiRevisionAsync(Guid revisionId, CancellationToken ct);
    Task<PoiVerificationRecord?> FindPoiVerificationAsync(Guid verificationId, CancellationToken ct);
    Task<IReadOnlyList<RouteRevisionStop>> GetStopsAsync(Guid revisionId, CancellationToken ct);
    Task<IReadOnlyList<RouteRevisionSubmission>> GetSubmissionsAsync(Guid revisionId, CancellationToken ct);
    Task<IReadOnlyList<RouteTestRun>> GetTestRunsAsync(Guid revisionId, CancellationToken ct);
    Task<IReadOnlyList<RouteTestRun>> GetTestRunsForRouteAsync(Guid routeId, CancellationToken ct);
    Task<PagedResult<Guid>> ListCurrentRevisionIdsAsync(string? search, Guid? mapVersionId,
        string sort, int page, int size, CancellationToken ct, bool? isActive = null);
    /// <summary>Tours not started yet that name this route; they keep it after a deactivation.</summary>
    Task<IReadOnlyList<RouteScheduledTourView>> ListScheduledToursAsync(Guid routeId, CancellationToken ct);
    Task<AuditLog?> FindAvailabilityRequestAsync(Guid actorUserId, Guid requestId, CancellationToken ct);
    Task<RouteRevisionSubmission?> FindSubmissionRequestAsync(Guid actorUserId, Guid requestId, CancellationToken ct);
    Task<RouteTestRun?> FindTestRequestAsync(Guid actorUserId, Guid requestId, CancellationToken ct);
    Task<User?> FindUserAsync(Guid userId, CancellationToken ct);
    Task<IReadOnlyList<User>> ListActiveStaffUsersAsync(CancellationToken ct);
    Task<Robot?> FindPhysicalRobotAsync(string robotCode, CancellationToken ct);
    Task LockRobotDeploymentStateAsync(Guid robotId, CancellationToken ct);
    Task<MapDeploymentCheck?> GetLatestDeploymentForRobotAsync(Guid robotId, CancellationToken ct);
    Task<MapDeploymentCheck?> FindDeploymentAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<RouteRevision>> ListSubmittedPendingAsync(CancellationToken ct);
    Task<string?> GetRobotCodeAsync(Guid robotId, CancellationToken ct);
    void Add(Route route);
    void Add(RouteRevision revision);
    void Add(RouteRevisionStop stop);
    void Add(RouteRevisionSubmission submission);
    void Add(RouteTestRun run);
    void AddAudit(AuditLog audit);
}
