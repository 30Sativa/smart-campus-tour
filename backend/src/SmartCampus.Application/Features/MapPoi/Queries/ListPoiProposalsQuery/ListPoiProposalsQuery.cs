using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record ListPoiProposalsQuery(Guid? MapVersionId) : IRequest<IReadOnlyList<PoiProposalView>>;
public sealed class ListPoiProposalsQueryHandler(IPoiProposalRepository proposalRepository, IPoiVerificationRepository verificationRepository)
    : IRequestHandler<ListPoiProposalsQuery, IReadOnlyList<PoiProposalView>>
{
    public async Task<IReadOnlyList<PoiProposalView>> Handle(ListPoiProposalsQuery query, CancellationToken ct)
    {
        var proposals = await proposalRepository.ListProposalsAsync(query.MapVersionId, ct);
        var result = new List<PoiProposalView>(proposals.Count);
        foreach (var proposal in proposals)
        {
            var revision = await proposalRepository.FindCurrentRevisionAsync(proposal.Id, ct)
                ?? throw new ConflictException("A POI proposal has no current revision.");
            result.Add(await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, proposal, revision, ct));
        }
        return result;
    }
}
