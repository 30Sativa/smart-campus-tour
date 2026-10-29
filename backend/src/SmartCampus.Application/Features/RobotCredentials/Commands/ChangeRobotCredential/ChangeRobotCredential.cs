using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.RobotCredentials;

public sealed record ChangeRobotCredentialRequest(Guid RequestId, string ExpectedRowVersion, string? Reason = null);
public sealed record RevokeRobotCredentialRequest(Guid RequestId, string Reason, string ExpectedRowVersion);

public sealed record ChangeRobotCredentialCommand(
    string RobotCode, Guid? ActorUserId, Guid RequestId, string? ExpectedRowVersion,
    string? Reason, RobotCredentialOperation Operation, string Source = "WEB")
    : ICommand<RobotCredentialChangeResult>;

public sealed class ChangeRobotCredentialCommandValidator
    : AbstractValidator<ChangeRobotCredentialCommand>
{
    public ChangeRobotCredentialCommandValidator()
    {
        RuleFor(command => command.RobotCode).Must(IsRobotCode)
            .WithMessage("RobotCode must start with a letter or number and contain only letters, numbers, dot, underscore or hyphen (max 100 characters).");
        RuleFor(command => command.RequestId).NotEmpty();
        RuleFor(command => command.Source).Must(source => source is "WEB" or "CLI");
        RuleFor(command => command.ActorUserId).NotEmpty().When(command => command.Source == "WEB");
        RuleFor(command => command.ExpectedRowVersion)
            .Must(IsOptionalRowVersion).WithMessage("ExpectedRowVersion must be a base64-encoded SQL rowversion.");
        RuleFor(command => command.ExpectedRowVersion).NotEmpty().When(command => command.Source == "WEB");
        RuleFor(command => command.Reason).MaximumLength(500);
        RuleFor(command => command.Reason).NotEmpty()
            .When(command => command.Operation == RobotCredentialOperation.Revoke);
        RuleFor(command => command.Operation).IsInEnum();
    }

    private static bool IsOptionalRowVersion(string? value)
    {
        if (value is null) return true;
        try
        {
            return Convert.FromBase64String(value) is { Length: 8 } bytes &&
                string.Equals(Convert.ToBase64String(bytes), value, StringComparison.Ordinal);
        }
        catch (FormatException) { return false; }
    }

    private static bool IsRobotCode(string? value)
    {
        if (value is null) return false;
        var code = value.Trim();
        return code.Length is > 0 and <= 100 &&
            code[0] is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' &&
            code.All(character => char.IsAsciiLetterOrDigit(character) || character is '_' or '.' or '-');
    }
}

public sealed class ChangeRobotCredentialCommandHandler(IPhysicalRobotCredentialManager manager)
    : IRequestHandler<ChangeRobotCredentialCommand, RobotCredentialChangeResult>
{
    public Task<RobotCredentialChangeResult> Handle(ChangeRobotCredentialCommand command, CancellationToken ct) =>
        manager.ChangeAsync(command.RobotCode.Trim(), command.Operation, command.RequestId,
            command.ActorUserId, command.Source, command.ExpectedRowVersion, command.Reason, ct);
}
