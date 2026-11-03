using FluentValidation;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Tours.Commands.StartTour;

/// <summary>A missing or false confirmation is a failing Start check, not a validation error.</summary>
public sealed class StartTourCommandValidator : AbstractValidator<StartTourCommand>
{
    public StartTourCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
        });
    }
}
