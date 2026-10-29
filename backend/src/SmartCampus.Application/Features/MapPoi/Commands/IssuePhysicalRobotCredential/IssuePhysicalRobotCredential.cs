using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record IssuePhysicalRobotCredentialRequest(string ExpectedRowVersion);

public sealed record IssuePhysicalRobotCredentialCommand(
    Guid ActorUserId, Guid RobotId, string ExpectedRowVersion, bool Rotate)
    : ICommand<PhysicalRobotCredentialIssue>;

public sealed class IssuePhysicalRobotCredentialCommandValidator
    : AbstractValidator<IssuePhysicalRobotCredentialCommand>
{
    public IssuePhysicalRobotCredentialCommandValidator()
    {
        RuleFor(command => command.ActorUserId).NotEmpty();
        RuleFor(command => command.RobotId).NotEmpty();
        RuleFor(command => command.ExpectedRowVersion)
            .Must(IsRowVersion).WithMessage("ExpectedRowVersion must be a base64-encoded SQL rowversion.");
    }

    private static bool IsRowVersion(string? value)
    {
        try
        {
            return value is not null && Convert.FromBase64String(value) is { Length: 8 } bytes &&
                string.Equals(Convert.ToBase64String(bytes), value, StringComparison.Ordinal);
        }
        catch (FormatException) { return false; }
    }
}

public sealed class IssuePhysicalRobotCredentialCommandHandler(
    IPhysicalRobotCredentialManager manager)
    : IRequestHandler<IssuePhysicalRobotCredentialCommand, PhysicalRobotCredentialIssue>
{
    public Task<PhysicalRobotCredentialIssue> Handle(
        IssuePhysicalRobotCredentialCommand command, CancellationToken cancellationToken) =>
        manager.IssueAsync(command.ActorUserId, command.RobotId, command.ExpectedRowVersion,
            command.Rotate, cancellationToken);
}
