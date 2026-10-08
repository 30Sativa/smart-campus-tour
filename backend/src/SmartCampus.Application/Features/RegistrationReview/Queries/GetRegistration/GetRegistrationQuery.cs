using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.RegistrationReview.Queries.GetRegistration;

public sealed record GetRegistrationQuery(Guid Id) : IQuery<ReviewDetails>;
