using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Tours.Queries.GetTours;

public sealed record GetToursQuery(TourListRequest Request) : IQuery<PagedResult<TourSummary>>;
