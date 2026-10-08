using SmartCampus.Application.Features.Representative.Queries.Tours;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTour;

public sealed record GetRepresentativeTourQuery(Guid Id, Guid Owner) : IQuery<TourResponse>;
