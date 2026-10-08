using SmartCampus.Application.Features.Representative.Queries.Lists;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;

public sealed record GetRepresentativeRegistrationsQuery(Guid Owner, RepresentativeListRequest Request)
    : IQuery<PagedResult<RegistrationListItem>>;
