using FluentValidation;

namespace SmartCampus.Application.Features.Tours.Commands.CreateTour;

public sealed class CreateTourCommandValidator : AbstractValidator<CreateTourCommand>
{
    public CreateTourCommandValidator()
    {
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.Configuration).NotNull().SetValidator(new CreateTourInputValidator());
        });
    }
}
