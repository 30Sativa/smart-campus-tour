using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Representative.Dtos;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;

public sealed record GetRepresentativeToursQuery(Guid Owner, RepresentativeListRequest Request)
    : IQuery<PagedResult<TourResponse>>;
