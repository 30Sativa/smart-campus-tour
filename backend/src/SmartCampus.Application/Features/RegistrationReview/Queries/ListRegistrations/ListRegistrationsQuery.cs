using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;

public sealed record ListRegistrationsQuery(ReviewListRequest Request) : IQuery<PagedResult<ReviewListItem>>;
