using FluentValidation;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Tours.Commands.RetryTourLeg;

public sealed record RetryTourLegRequest(Guid RequestId, string ExpectedRowVersion);
public sealed record RetryTourLegCommand(Guid Id, Guid Actor, RetryTourLegRequest Request) : ITourMutationCommand<TourMutationResult>;

public sealed class RetryTourLegCommandValidator : AbstractValidator<RetryTourLegCommand>
{
    public RetryTourLegCommandValidator()
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
