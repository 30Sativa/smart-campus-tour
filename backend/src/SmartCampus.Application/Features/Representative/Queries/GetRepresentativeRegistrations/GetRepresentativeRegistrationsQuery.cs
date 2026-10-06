using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Models;
using SmartCampus.Application.Features.Representative.Dtos;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;

public sealed record GetRepresentativeRegistrationsQuery(Guid Owner, RepresentativeListRequest Request)
    : IQuery<PagedResult<RegistrationListItem>>;
