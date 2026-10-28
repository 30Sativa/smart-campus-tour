using FluentValidation;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;

namespace SmartCampus.Application.Features.Tours.Commands.UpdateTour;

public sealed class UpdateTourCommandValidator : AbstractValidator<UpdateTourCommand>
{
    public UpdateTourCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
            RuleFor(c => c.Request.ExpectedRouteVersion).Must(v => v is null || LegacyRouteRevision.IsValid(v));
            RuleFor(c => c.Request.Configuration).NotNull().SetValidator(new TourInputValidator());
        });
    }
}
