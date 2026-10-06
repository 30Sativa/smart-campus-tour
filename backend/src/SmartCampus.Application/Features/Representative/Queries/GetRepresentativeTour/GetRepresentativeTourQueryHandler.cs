using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Representative.Dtos;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTour;

public sealed class GetRepresentativeTourQueryHandler(IRepresentativeRepository repository)
    : IRequestHandler<GetRepresentativeTourQuery, TourResponse>
{
    public async Task<TourResponse> Handle(GetRepresentativeTourQuery query, CancellationToken ct)
    {
        var tour = await repository.GetTourAsync(query.Id, query.Owner, ct)
            ?? throw new NotFoundException("Không tìm thấy dữ liệu.");
        return RepresentativeResponseMapper.Tour(tour);
    }
}
