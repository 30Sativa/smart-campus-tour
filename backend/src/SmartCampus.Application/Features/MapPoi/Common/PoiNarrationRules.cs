using FluentValidation;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

/// <summary>Narration version states (ADR-0060). SQL CHECK CK_PoiNarrationRevisions_State holds the same list.</summary>
public static class PoiNarrationStates
{
    public const string Draft = "DRAFT";
    public const string Approved = "APPROVED";
    public const string Superseded = "SUPERSEDED";
    public const string Discarded = "DISCARDED";
}

/// <summary>Shared rules of the POI narration draft, approve and discard commands (ADR-0060).</summary>
internal static class PoiNarrationRules
{
    public const string SelfApprovalForbiddenCode = "NARRATION_SELF_APPROVAL_FORBIDDEN";
    public const string NotDraftCode = "NARRATION_NOT_DRAFT";
    public const int MaxTextLength = 4000;
    /// <summary>The receipt and request-lock operation; one request id per user covers every narration operation.</summary>
    public const string LockOperation = "poi-narration";

    public static void AddTextRules<T>(IRuleBuilderInitial<T, SavePoiNarrationDraftRequest> rules)
    {
        rules.Must(request => !string.IsNullOrWhiteSpace(request.NarrationText) && request.NarrationText.Trim().Length <= MaxTextLength)
            .WithMessage($"Nội dung thuyết minh là bắt buộc và không quá {MaxTextLength} ký tự.");
        // `fallbackVideoUrl` is still accepted on the wire but ignored: no screen ever played a POI video. The Tour's own
        // fallback video is the one students see. The column stays until a later schema drops it.
    }

    public static void EnsureRowVersion(PoiNarrationRevision narration, string expectedRowVersion)
    {
        if (!narration.RowVersion.AsSpan().SequenceEqual(PoiProposalRowVersion.Decode(expectedRowVersion)))
            throw StaleVersion();
    }

    public static ConflictException StaleVersion() =>
        new("Thuyết minh đã thay đổi từ lúc bạn mở. Tải lại rồi thử lại.", "STALE_VERSION");

    public static void EnsureDraft(PoiNarrationRevision narration)
    {
        if (narration.State != PoiNarrationStates.Draft)
            throw new ConflictException($"Bản thuyết minh số {narration.RevisionNumber} không còn là bản nháp.", NotDraftCode);
    }

    /// <summary>
    /// Replays a stored request: the same content returns the narration version's current view, other content is a
    /// conflict. Returns null when the request id is new.
    /// </summary>
    public static async Task<PoiNarrationRevisionView?> ReplayAsync(IPoiProposalRepository repository, Guid actorUserId,
        Guid requestId, byte[] requestHash, CancellationToken cancellationToken)
    {
        var receipt = await repository.FindNarrationReceiptAsync(actorUserId, requestId, cancellationToken);
        if (receipt is null) return null;
        MapPoiRequestIdempotency.EnsureSameRequest(receipt.RequestHash, requestHash);
        return await LoadViewAsync(repository, receipt.NarrationRevisionId, cancellationToken);
    }

    public static async Task<PoiProposal> LockWritableProposalAsync(IPoiProposalRepository repository, Guid proposalId,
        CancellationToken cancellationToken)
    {
        // The same row lock as revise, submit, verify, import and POI discard: narration writes of one POI serialize.
        var proposal = await repository.LockProposalAsync(proposalId, cancellationToken)
            ?? throw new NotFoundException("POI proposal", proposalId);
        PoiProposalRules.EnsureWritable(proposal);
        return proposal;
    }

    public static PoiNarrationRequestReceipt Receipt(Guid actorUserId, Guid requestId, byte[] requestHash, string operation,
        Guid narrationId, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(), ActorUserId = actorUserId, RequestId = requestId, RequestHash = requestHash,
        Operation = operation, NarrationRevisionId = narrationId, CreatedAt = now
    };

    public static async Task<PoiNarrationRevisionView> LoadViewAsync(IPoiProposalRepository repository, Guid narrationId,
        CancellationToken cancellationToken) =>
        ToView(await repository.GetNarrationForViewAsync(narrationId, cancellationToken)
            ?? throw new NotFoundException("POI narration", narrationId));

    public static PoiNarrationRevisionView ToView(PoiNarrationRevision narration) => new(
        narration.Id, narration.ProposalId, narration.RevisionNumber, narration.State, narration.NarrationText,
        narration.FallbackVideoUrl, narration.CreatedByUserId, narration.CreatedByUser.FullName, narration.CreatedAt,
        narration.LastEditedByUserId, narration.LastEditedByUser.FullName, narration.LastEditedAt,
        narration.ApprovedByUserId, narration.ApprovedByUser?.FullName, narration.ApprovedAt,
        Convert.ToBase64String(narration.RowVersion));

    /// <summary>The summary on PoiProposalView: the current approved and draft versions of one POI, if any.</summary>
    public static PoiNarrationSummary Summary(IEnumerable<PoiNarrationRevision> current)
    {
        PoiNarrationApprovedSummary? approved = null;
        PoiNarrationDraftSummary? draft = null;
        foreach (var narration in current)
        {
            if (narration.State == PoiNarrationStates.Approved)
                approved = new(narration.RevisionNumber, narration.ApprovedByUserId!.Value,
                    narration.ApprovedByUser!.FullName, narration.ApprovedAt!.Value);
            else if (narration.State == PoiNarrationStates.Draft)
                draft = new(narration.RevisionNumber, narration.LastEditedByUserId, narration.LastEditedByUser.FullName,
                    narration.LastEditedAt, Convert.ToBase64String(narration.RowVersion));
        }
        return new(approved, draft);
    }
}
