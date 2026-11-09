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
            throw new ValidationException("POI coordinates must fit the persisted meter/radian precision.");
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
        NarrationText = draft.NarrationText,
        FallbackVideoUrl = draft.FallbackVideoUrl,
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
    public const string HasPassCode = "POI_PROPOSAL_HAS_PASS";

    /// <summary>
    /// Only a proposal with no PASS on any revision may be discarded: a Route revision can only reference a POI revision
    /// with an effective PASS, so such a proposal is in no Route, Tour or history that a discard could orphan.
    /// </summary>
    public static bool CanDiscard(IEnumerable<PoiVerificationRecord> results) =>
        !results.Any(result => result.ResultCode == "PASS");

    public static void EnsureNotDiscarded(PoiProposal proposal)
    {
        if (proposal.DiscardedAt is not null)
            throw new ConflictException("POI này đã bị xoá khỏi danh sách nên không thể chỉnh sửa, gửi hay kiểm chứng.", DiscardedCode);
    }

    public static void EnsureCurrent(PoiProposal proposal, int expectedRevision, string expectedRowVersion)
    {
        EnsureNotDiscarded(proposal);
        if (proposal.CurrentRevision != expectedRevision ||
            !proposal.RowVersion.AsSpan().SequenceEqual(PoiProposalRowVersion.Decode(expectedRowVersion)))
            throw new ConflictException("The proposal changed since it was loaded. Reload it before retrying.", "STALE_VERSION");
    }
}
