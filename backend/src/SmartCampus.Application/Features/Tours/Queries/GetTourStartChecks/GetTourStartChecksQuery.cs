using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Queries.GetTourStartChecks;

/// <summary>The Start checklist as <paramref name="Viewer"/> sees it now; on-site confirmations are only in Start.</summary>
public sealed record GetTourStartChecksQuery(Guid Id, Guid Viewer) : IQuery<TourStartChecks>;
