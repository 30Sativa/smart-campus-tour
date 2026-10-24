using SmartCampus.Application.Features.Representative.Queries.Tours;
using SmartCampus.Application.Features.Representative.Queries.Lists;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;

public sealed record GetRepresentativeToursQuery(Guid Owner, RepresentativeListRequest Request)
    : IQuery<PagedResult<TourResponse>>;
