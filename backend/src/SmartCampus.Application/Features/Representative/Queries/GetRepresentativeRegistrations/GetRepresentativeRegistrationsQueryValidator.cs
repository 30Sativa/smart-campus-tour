using SmartCampus.Application.Features.Representative.Queries.Lists;
using FluentValidation;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;

public sealed class GetRepresentativeRegistrationsQueryValidator : AbstractValidator<GetRepresentativeRegistrationsQuery>
{
    public GetRepresentativeRegistrationsQueryValidator() =>
        RuleFor(x => x.Request).SetValidator(new RepresentativeListValidator(RepresentativeListValidator.RegistrationSorts));
}
