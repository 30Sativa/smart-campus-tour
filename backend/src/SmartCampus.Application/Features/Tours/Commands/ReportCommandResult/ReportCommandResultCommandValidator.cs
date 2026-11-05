using FluentValidation;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours.Commands.ReportCommandResult;

public sealed class ReportCommandResultCommandValidator : AbstractValidator<ReportCommandResultCommand>
{
    public ReportCommandResultCommandValidator()
    {
        RuleFor(c => c.RobotCode).NotEmpty();
        RuleFor(c => c.CommandId).NotEmpty();
        RuleFor(c => c.LegId).NotEmpty();
        RuleFor(c => c.StreamId).NotEmpty();
        RuleFor(c => c.Phase).Must(phase => phase is CommandResultPhases.Accepted or CommandResultPhases.Rejected or CommandResultPhases.Terminal);
        RuleFor(c => c.Outcome).Must(outcome => outcome is RobotCommandStates.Arrived or RobotCommandStates.Failed or RobotCommandStates.Cancelled)
            .When(c => c.Phase == CommandResultPhases.Terminal);
        RuleFor(c => c.Outcome).Null().When(c => c.Phase != CommandResultPhases.Terminal);
        RuleFor(c => c.Reason).MaximumLength(100).Matches("^[A-Z][A-Z0-9_]*$").When(c => c.Reason is not null);
    }
}
