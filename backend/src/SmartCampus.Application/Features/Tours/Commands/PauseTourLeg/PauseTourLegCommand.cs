using FluentValidation;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Tours.Commands.PauseTourLeg;

public sealed record PauseTourLegRequest(Guid RequestId, string ExpectedRowVersion);
public sealed record PauseTourLegCommand(Guid Id, Guid Actor, PauseTourLegRequest Request) : ITourMutationCommand<TourMutationResult>;

public sealed class PauseTourLegCommandValidator : AbstractValidator<PauseTourLegCommand>
{
    public PauseTourLegCommandValidator()
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
