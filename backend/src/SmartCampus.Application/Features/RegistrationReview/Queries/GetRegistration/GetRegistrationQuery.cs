using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration.Dtos;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;

public sealed record GetRegistrationQuery(Guid Id) : IQuery<ReviewDetails>;
