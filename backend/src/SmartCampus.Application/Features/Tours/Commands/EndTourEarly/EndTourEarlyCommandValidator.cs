using FluentValidation;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Tours.Commands.EndTourEarly;

public sealed class EndTourEarlyCommandValidator : AbstractValidator<EndTourEarlyCommand>
{
    public EndTourEarlyCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.ExpectedRowVersion).Must(RowVersionToken.IsValid);
            RuleFor(c => c.Request.Reason).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(1000);
        });
    }
}
