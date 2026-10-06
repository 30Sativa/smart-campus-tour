using FluentValidation;

namespace SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;

public sealed class GetRepresentativeToursQueryValidator : AbstractValidator<GetRepresentativeToursQuery>
{
    public GetRepresentativeToursQueryValidator() =>
        RuleFor(x => x.Request).SetValidator(new RepresentativeListValidator(RepresentativeListValidator.TourSorts));
}
