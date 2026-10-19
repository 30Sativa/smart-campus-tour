using FluentValidation;

namespace SmartCampus.Application.Features.Routes.Queries.GetRoutes;

public sealed class GetRoutesQueryValidator : AbstractValidator<GetRoutesQuery>
{
    public GetRoutesQueryValidator()
    {
        RuleFor(q => q.Page).GreaterThan(0).LessThanOrEqualTo(1_000_000);
        RuleFor(q => q.Size).InclusiveBetween(1, 100);
        RuleFor(q => q.Search).MaximumLength(200);
        RuleFor(q => q.Sort).Must(s => s is "name" or "-name" or "createdAt" or "-createdAt");
    }
}
