using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Queries.GetTourStartChecks;

/// <summary>
/// The Start checklist as <paramref name="Viewer"/> sees it now; on-site confirmations are only in Start.
/// <paramref name="HoldAtStart"/> answers for opening the Tour without its first leg.
/// </summary>
public sealed record GetTourStartChecksQuery(Guid Id, Guid Viewer, bool HoldAtStart = false) : IQuery<TourStartChecks>;
