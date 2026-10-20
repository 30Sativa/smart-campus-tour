using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Queries.GetTour;

public sealed record GetTourQuery(Guid Id) : IQuery<TourDetails>;
