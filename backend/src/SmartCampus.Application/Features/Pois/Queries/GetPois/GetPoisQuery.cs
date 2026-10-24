using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Pois.Dtos;

namespace SmartCampus.Application.Features.Pois.Queries.GetPois;

public sealed record GetPoisQuery(GetPoisRequest Request) : IQuery<PagedResult<PoiListItemResponse>>;
