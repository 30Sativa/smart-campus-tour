using FluentValidation;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

public sealed class RouteInputValidator : AbstractValidator<RouteInput>
{
    public RouteInputValidator()
    {
        RuleFor(r => r.Name).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(150);
        RuleFor(r => r.Description).MaximumLength(1000);
        RuleFor(r => r.MapKey).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(100);
        RuleFor(r => r.MapFrame).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(100);
        RuleFor(r => r.StartX).Must(Route.Coordinate);
        RuleFor(r => r.StartY).Must(Route.Coordinate);
        RuleFor(r => r.StartYaw).Must(Route.Heading);
        RuleFor(r => r.EndMode).Must(v => v is "POSE" or "LAST_POI");
        RuleFor(r => r.EndX).Must(v => !v.HasValue || Route.Coordinate(v.Value));
        RuleFor(r => r.EndY).Must(v => !v.HasValue || Route.Coordinate(v.Value));
        RuleFor(r => r.EndYaw).Must(v => !v.HasValue || Route.Heading(v.Value));
        RuleFor(r => r.Stops).NotEmpty().Must(s => s is null || s.Count <= 100);
        When(r => r.Stops is not null, () => RuleForEach(r => r.Stops).NotNull().ChildRules(stop =>
        {
            stop.RuleFor(s => s.PoiId).NotEmpty();
            stop.RuleFor(s => s.DwellSeconds).GreaterThan(0);
            stop.RuleFor(s => s.HeadSteps).NotEmpty().Must(s => s is null || s.Count <= 100);
            stop.When(s => s.HeadSteps is not null, () => stop.RuleForEach(s => s.HeadSteps).NotNull());
        }));
    }
}
