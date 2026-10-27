using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record GetPoiProposalQuery(Guid Id) : IRequest<PoiProposalView>;
public sealed class GetPoiProposalQueryHandler(IPoiProposalRepository proposalRepository, IPoiVerificationRepository verificationRepository)
    : IRequestHandler<GetPoiProposalQuery, PoiProposalView>
{
    public async Task<PoiProposalView> Handle(GetPoiProposalQuery query, CancellationToken ct)
    {
        var proposal = await proposalRepository.FindProposalAsync(query.Id, ct)
            ?? throw new NotFoundException("POI proposal", query.Id);
        var revision = await proposalRepository.FindCurrentRevisionAsync(proposal.Id, ct)
            ?? throw new ConflictException("A POI proposal has no current revision.");
        return await PoiProposalReadModelLoader.LoadAsync(proposalRepository, verificationRepository, proposal, revision, ct);
    }
}
