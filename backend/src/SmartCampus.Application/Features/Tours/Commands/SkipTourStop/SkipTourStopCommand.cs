using FluentValidation;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Tours.Commands.SkipTourStop;

/// <summary><paramref name="Confirmation"/> is required only when skipping from the start, which is also the departure.</summary>
public sealed record SkipTourStopRequest(Guid RequestId, string ExpectedRowVersion, TourStartConfirmation? Confirmation = null);
public sealed record SkipTourStopCommand(Guid Id, Guid Actor, SkipTourStopRequest Request) : ITourMutationCommand<TourMutationResult>;

public sealed class SkipTourStopCommandValidator : AbstractValidator<SkipTourStopCommand>
{
    public SkipTourStopCommandValidator()
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
