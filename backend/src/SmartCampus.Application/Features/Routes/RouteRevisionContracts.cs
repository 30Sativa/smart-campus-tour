using SmartCampus.Domain.Entities;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Routes;

public sealed record RouteRevisionStopInput(Guid PoiRevisionId, int DwellSeconds, IReadOnlyList<RouteHeadStep> HeadSteps);
public sealed record RouteRevisionDraftInput(
    Guid RequestId, int ExpectedCurrentRevision, string Name, string? Description, Guid MapVersionId,
    decimal StartX, decimal StartY, decimal StartYaw, string EndMode,
    decimal? EndX, decimal? EndY, decimal? EndYaw,
    IReadOnlyList<RouteRevisionStopInput> Stops);
public sealed record RouteRevisionRequest(Guid RequestId, int ExpectedCurrentRevision);
public sealed record RouteRunRequest(
    Guid RequestId, string RobotCode, Guid ParticipatingStaffUserId,
    string ResultCode, bool AllStopsReached, bool SafelyStopped, bool LocalizationPassed,
    int MeasuredDurationSeconds, string? FailureReason, string EvidenceNote);

public sealed record RouteRevisionStopView(Guid PoiRevisionId, Guid SourcePoiVerificationRecordId,
    int StopOrder, int DwellSeconds, IReadOnlyList<RouteHeadStep> HeadSteps,
    string Name, decimal X, decimal Y, decimal Yaw, string CameraPreset,
    string? NarrationText = null, string? FallbackVideoUrl = null);
public sealed record RouteTestRunView(Guid Id, Guid RouteRevisionId, Guid MapVersionId, string MapPackageSha256,
    string RobotCode, Guid CheckedByUserId, Guid ParticipatingStaffUserId, string ResultCode,
    bool AllStopsReached, bool SafelyStopped, bool LocalizationPassed, int MeasuredDurationSeconds,
    string? FailureReason, string EvidenceNote, DateTimeOffset CheckedAt, string? MeasurementBasis);
/// <summary>What a route test measured. A run without a basis predates ADR-0035 and cannot size a reservation.</summary>
public static class RouteMeasurementBasis { public const string TotalWithDwell = "TOTAL_WITH_DWELL"; }
public sealed record RouteTestParticipantView(Guid UserId, string FullName, string Username);
public sealed record RouteRevisionSummaryView(Guid RevisionId, int RevisionNumber, Guid MapVersionId,
    string MapPackageSha256, string ConfigurationFingerprint, bool IsSubmitted, string VerificationStatus,
    Guid? EffectiveTestRunId, DateTimeOffset CreatedAt);
public sealed record RouteRevisionView(Guid RouteId, Guid RevisionId, int RevisionNumber, string Name,
    string? Description, Guid MapVersionId, string MapKey, string MapPackageSha256,
    decimal StartX, decimal StartY, decimal StartYaw, string EndMode, decimal? EndX, decimal? EndY,
    decimal? EndYaw, string ConfigurationFingerprint, bool IsSubmitted, string VerificationStatus,
    Guid? EffectiveTestRunId, string DurationStatus, int DwellDurationSeconds,
    IReadOnlyList<RouteRevisionStopView> Stops, IReadOnlyList<RouteTestRunView> TestRuns,
    IReadOnlyList<RouteRevisionSummaryView> RevisionHistory, IReadOnlyList<string> EligibilityIssues,
    bool IsActive = true, string RowVersion = "");
public sealed record RouteAvailabilityRequest(Guid RequestId, string ExpectedRowVersion);
public sealed record RouteScheduledTourView(Guid Id, string Name, DateTimeOffset ScheduledStartAt, string State);
public sealed record RouteAvailabilityResult(Guid RouteId, bool IsActive, IReadOnlyList<RouteScheduledTourView> ScheduledTours);

public sealed record RoutePoiRevisionEvidence(PoiProposalRevision Revision, PoiVerificationRecord Verification);

public sealed record RouteNavigationStopConfiguration(int StopOrder, byte[] PoiNavigationFingerprint,
    string CameraPreset, IReadOnlyList<RouteHeadStep> HeadSteps);
public sealed record RouteNavigationConfiguration(Guid MapVersionId, byte[] MapPackageSha256,
    decimal StartX, decimal StartY, decimal StartYaw, string EndMode, decimal? EndX, decimal? EndY,
    decimal? EndYaw, IReadOnlyList<RouteNavigationStopConfiguration> Stops);

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
