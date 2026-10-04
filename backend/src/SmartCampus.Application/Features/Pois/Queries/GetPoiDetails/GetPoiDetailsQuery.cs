using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Pois.Dtos;

namespace SmartCampus.Application.Features.Pois.Queries.GetPoiDetails;

public sealed record GetPoiDetailsQuery(Guid Id) : IQuery<PoiDetailsResponse>;
