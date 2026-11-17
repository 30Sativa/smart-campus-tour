using MediatR;
using SmartCampus.Application.Features.MapPoi;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// Gives a POI approved narration through the real commands (ADR-0060), as every route revision now needs. The
/// approver must differ from the author; the Staff-only role is enforced by the controller, not by these commands.
/// </summary>
internal static class NarrationSeed
{
    public static async Task<PoiNarrationRevisionView> ApproveAsync(
        Func<IRequest<PoiNarrationRevisionView>, Task<PoiNarrationRevisionView>> send,
        Guid authorId, Guid approverId, Guid proposalId, string text = "Đây là điểm tham quan.")
    {
        var draft = await send(new SavePoiNarrationDraftCommand(authorId, proposalId, new(Guid.NewGuid(), null, text, null)));
        return await send(new ApprovePoiNarrationCommand(approverId, proposalId, draft.RevisionNumber, new(Guid.NewGuid(), draft.RowVersion)));
    }
}
