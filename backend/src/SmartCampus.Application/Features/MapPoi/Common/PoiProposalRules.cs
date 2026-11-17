using System.Security.Cryptography;
using FluentValidation;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

internal static class PoiProposalRules
{
    public static void ValidatePosition(MapVersion map, PoiProposalDraft draft)
    {
        EnsurePersistedPrecision(draft);
        var package = MapPackageValidator.Validate(map.PackageBytes);
        MapPackageValidator.EnsureFreePosition(package, draft.X, draft.Y, draft.Yaw);
    }

    /// <summary>
    /// A revision that keeps its predecessor's map and position writes no new pose. Such a pose may predate the
    /// clearance rule, and refusing it would stop Staff editing the content of a POI whose PASS still stands.
    /// </summary>
    public static void ValidateWrittenPosition(MapVersion map, PoiProposalDraft draft, MapPoiSettings settings,
        PoiProposalRevision? previous = null)
    {
        if (previous is not null && previous.MapVersionId == draft.MapVersionId && previous.X == draft.X && previous.Y == draft.Y)
        {
            ValidatePosition(map, draft);
            return;
        }
        EnsurePersistedPrecision(draft);
        var package = MapPackageValidator.Validate(map.PackageBytes);
        MapPackageValidator.EnsureClearPosition(package, draft.X, draft.Y, draft.Yaw, settings.PoiClearanceMeters);
    }

    private static void EnsurePersistedPrecision(PoiProposalDraft draft)
    {
        if (draft.X != decimal.Round(draft.X, 4) || draft.Y != decimal.Round(draft.Y, 4) ||
            draft.Yaw != decimal.Round(draft.Yaw, 6) || draft.X is < -999999.9999m or > 999999.9999m ||
            draft.Y is < -999999.9999m or > 999999.9999m)
            throw new ValidationException("Tọa độ POI vượt độ chính xác cho phép (X, Y 4 số lẻ; hướng 6 số lẻ radian).");
    }

    /// <summary>The robot's newest check across all maps must be a pass on this exact version and package.</summary>
    public static bool IsDeployedOn(MapDeploymentCheck? latestDeployment, MapVersion map) =>
        latestDeployment is not null && latestDeployment.MapVersionId == map.Id &&
        latestDeployment.LocalizationPassed && latestDeployment.DisplayPassed &&
        CryptographicOperations.FixedTimeEquals(latestDeployment.PackageSha256, map.PackageSha256);

    public static PoiProposalRevision CreateRevision(Guid proposalId, int revisionNumber, Guid actorUserId,
        Guid requestId, byte[] requestHash, PoiProposalDraft draft, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        ProposalId = proposalId,
        RevisionNumber = revisionNumber,
        MapVersionId = draft.MapVersionId,
        Name = draft.Name,
        Purpose = draft.Purpose,
        Description = draft.Description,
        X = draft.X,
        Y = draft.Y,
        Yaw = draft.Yaw,
        CameraPreset = draft.CameraPreset,
        NavigationFingerprint = PoiNavigationFingerprint.Compute(draft),
        RequestId = requestId,
        RequestHash = requestHash,
        CreatedByUserId = actorUserId,
        CreatedAt = now
    };
    public const string DiscardedCode = "POI_PROPOSAL_DISCARDED";
    public const string InRouteCode = "POI_PROPOSAL_IN_ROUTE";
    public const string RetiredCode = "POI_RETIRED";
    public const string NotRetirableCode = "POI_NOT_RETIRABLE";
    public const string RetiredAudit = "POI_PROPOSAL_RETIRED";
    public const string ReactivatedAudit = "POI_PROPOSAL_REACTIVATED";

    public static bool HasPass(IEnumerable<PoiVerificationRecord> results) =>
        results.Any(result => result.ResultCode == "PASS");

    /// <summary>
    /// ADR-0051 amended by ADR-0062: a proposal may be discarded when no revision of it is a stop of any route revision
    /// (retired routes included; a Tour always points at a route revision). A proposal that never passed cannot be in a
    /// route, so the ADR-0051 case is a subset. The caller holds the proposal row lock, which SaveRouteRevision also takes.
    /// </summary>
    public static bool CanDiscard(PoiProposal proposal, bool usedInRoute) =>
        proposal.DiscardedAt is null && proposal.RetiredAt is null && !usedInRoute;

    /// <summary>"Ngưng dùng" is for a POI that once passed and cannot be discarded because a route uses it (ADR-0062).</summary>
    public static bool CanRetire(PoiProposal proposal, bool hasPass, bool usedInRoute) =>
        hasPass && proposal.DiscardedAt is null && proposal.RetiredAt is null && !CanDiscard(proposal, usedInRoute);

    public static bool CanReactivate(PoiProposal proposal) => proposal.DiscardedAt is null && proposal.RetiredAt is not null;

    public static void EnsureNotDiscarded(PoiProposal proposal)
    {
        if (proposal.DiscardedAt is not null)
            throw new ConflictException("POI này đã bị xoá khỏi danh sách nên không thể chỉnh sửa, gửi hay kiểm chứng.", DiscardedCode);
    }

    public static void EnsureNotRetired(PoiProposal proposal)
    {
        if (proposal.RetiredAt is not null)
            throw new ConflictException("POI này đã ngưng dùng nên không thể chỉnh sửa, gửi kiểm, ghi kết quả kiểm hay đổi thuyết minh. Dùng lại POI trước.", RetiredCode);
    }

    /// <summary>Every writer of new POI work: create revision, submit, verify, narration and import.</summary>
    public static void EnsureWritable(PoiProposal proposal)
    {
        EnsureNotDiscarded(proposal);
        EnsureNotRetired(proposal);
    }

    public static void EnsureCurrent(PoiProposal proposal, int expectedRevision, string expectedRowVersion)
    {
        EnsureWritable(proposal);
        if (proposal.CurrentRevision != expectedRevision ||
            !proposal.RowVersion.AsSpan().SequenceEqual(PoiProposalRowVersion.Decode(expectedRowVersion)))
            throw new ConflictException("The proposal changed since it was loaded. Reload it before retrying.", "STALE_VERSION");
    }
}
