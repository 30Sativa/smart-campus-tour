using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations.Dtos;
using SmartCampus.Application.Features.Representative.Queries.Lists;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;

public sealed record GetRepresentativeRegistrationsQuery(Guid Owner, RepresentativeListRequest Request)
    : IQuery<PagedResult<RegistrationListItem>>;
