using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Representative.Dtos;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTour;

public sealed record GetRepresentativeTourQuery(Guid Id, Guid Owner) : IQuery<TourResponse>;
