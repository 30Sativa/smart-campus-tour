using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration;

public sealed record GetRepresentativeRegistrationQuery(Guid Id, Guid Owner) : IQuery<RegistrationDetails>;
