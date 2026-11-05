using FluentValidation;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.ReconcileRobotCommand;

public sealed record ReconcileRobotCommandRequest(Guid RequestId, string Reason);
public sealed record ReconcileRobotCommandCommand(Guid TourId, Guid CommandId, Guid Actor, ReconcileRobotCommandRequest Request)
    : ITourMutationCommand<TourMutationResult>;

public sealed class ReconcileRobotCommandCommandValidator : AbstractValidator<ReconcileRobotCommandCommand>
{
    public ReconcileRobotCommandCommandValidator()
    {
        RuleFor(c => c.TourId).NotEmpty();
        RuleFor(c => c.CommandId).NotEmpty();
        RuleFor(c => c.Actor).NotEmpty();
        RuleFor(c => c.Request).NotNull();
        When(c => c.Request is not null, () =>
        {
            RuleFor(c => c.Request.RequestId).NotEmpty();
            RuleFor(c => c.Request.Reason).NotEmpty().Must(v => !string.IsNullOrWhiteSpace(v)).MaximumLength(1000);
        });
    }
}
