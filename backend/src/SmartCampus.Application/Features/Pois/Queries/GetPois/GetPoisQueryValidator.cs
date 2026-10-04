using FluentValidation;
using SmartCampus.Application.Features.Pois.Dtos;

namespace SmartCampus.Application.Features.Pois.Queries.GetPois;

public sealed class GetPoisQueryValidator : AbstractValidator<GetPoisQuery>
{
    public GetPoisQueryValidator()
    {
        RuleFor(query => query.Request).NotNull();
        When(query => query.Request is not null, () =>
        {
            RuleFor(query => query.Request.Page).GreaterThanOrEqualTo(1)
                .OverridePropertyName(nameof(GetPoisRequest.Page));
            RuleFor(query => query.Request.Size).InclusiveBetween(1, 100)
                .OverridePropertyName("PageSize");
            RuleFor(query => query.Request.Search).MaximumLength(200)
                .OverridePropertyName(nameof(GetPoisRequest.Search));
            RuleFor(query => query.Request.Sort)
                .Must(sort => PoiSortParser.TryParse(sort, out _))
                .WithMessage("Sort must use a supported POI field, optionally prefixed with '-'.")
                .OverridePropertyName(nameof(GetPoisRequest.Sort));
        });
    }
}
