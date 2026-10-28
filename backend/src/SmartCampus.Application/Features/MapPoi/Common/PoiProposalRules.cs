using System.Security.Cryptography;
using FluentValidation;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

internal static class PoiProposalRules
{
    public static void ValidatePosition(MapVersion map, PoiProposalDraft draft)
    {
        if (draft.X != decimal.Round(draft.X, 4) || draft.Y != decimal.Round(draft.Y, 4) ||
            draft.Yaw != decimal.Round(draft.Yaw, 6) || draft.X is < -999999.9999m or > 999999.9999m ||
            draft.Y is < -999999.9999m or > 999999.9999m)
            throw new ValidationException("POI coordinates must fit the persisted meter/radian precision.");
        var package = MapPackageValidator.Validate(map.PackageBytes);
        MapPackageValidator.EnsureFreePosition(package, draft.X, draft.Y, draft.Yaw);
    }

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
    public static void EnsureCurrent(PoiProposal proposal, int expectedRevision, string expectedRowVersion)
    {
        if (proposal.CurrentRevision != expectedRevision ||
            !proposal.RowVersion.AsSpan().SequenceEqual(PoiProposalRowVersion.Decode(expectedRowVersion)))
            throw new ConflictException("The proposal changed since it was loaded. Reload it before retrying.", "STALE_VERSION");
    }
}
