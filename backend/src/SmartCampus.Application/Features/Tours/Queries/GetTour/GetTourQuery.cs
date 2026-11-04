using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Queries.GetTour;

/// <summary><paramref name="Viewer"/> is who allowedActions answer for; without one they are all refused.</summary>
public sealed record GetTourQuery(Guid Id, Guid? Viewer = null) : IQuery<TourDetails>;
