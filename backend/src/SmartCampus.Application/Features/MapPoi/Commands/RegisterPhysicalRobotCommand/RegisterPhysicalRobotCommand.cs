using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record RegisterPhysicalRobotRequest(string RobotCode, string DisplayName);

public sealed record RegisterPhysicalRobotCommand(Guid ActorUserId, RegisterPhysicalRobotRequest Request)
    : ICommand<PhysicalRobotOption>;

public sealed class RegisterPhysicalRobotCommandValidator : AbstractValidator<RegisterPhysicalRobotCommand>
{
    public RegisterPhysicalRobotCommandValidator()
    {
        RuleFor(command => command.Request.RobotCode)
            .Must(IsValidRobotCode)
            .WithMessage("RobotCode must start with a letter or number and contain only letters, numbers, dot, underscore or hyphen (max 100 characters).");
        RuleFor(command => command.Request.DisplayName)
            .Must(name => !string.IsNullOrWhiteSpace(name?.Trim()))
            .WithMessage("DisplayName is required.")
            .Must(name => name is not null && name.Trim().Length <= 150)
            .WithMessage("DisplayName must be at most 150 characters.");
        RuleFor(command => command.ActorUserId).NotEmpty();
    }

    private static bool IsValidRobotCode(string? value)
    {
        if (value is null) return false;
        var code = value.Trim();
        return code.Length is > 0 and <= 100 &&
            code[0] is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' &&
            code.All(character => char.IsAsciiLetterOrDigit(character) || character is '_' or '.' or '-');
    }
}

public sealed class RegisterPhysicalRobotCommandHandler(
    IPhysicalRobotRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<RegisterPhysicalRobotCommand, PhysicalRobotOption>
{
    public async Task<PhysicalRobotOption> Handle(RegisterPhysicalRobotCommand command, CancellationToken cancellationToken)
    {
        var robotCode = command.Request.RobotCode.Trim();
        if (await repository.RobotCodeExistsAsync(robotCode, cancellationToken))
            throw new ConflictException("Mã robot đã được đăng ký. Kiểm tra lại mã robot trước khi thử lại.", "ROBOT_CODE_CONFLICT");

        var robot = new Robot
        {
            Id = Guid.NewGuid(),
            RobotCode = robotCode,
            DisplayName = command.Request.DisplayName.Trim(),
            SourceType = "PHYSICAL",
            CredentialHash = null,
            IsDispatchEnabled = false,
            NeedsInspection = false,
            CurrentTourId = null,
            LastAssignedAt = null,
            CreatedAt = timeProvider.GetUtcNow(),
            UpdatedAt = null
        };
        repository.Add(robot);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            RobotId = robot.Id,
            Action = "PHYSICAL_ROBOT_REGISTERED",
            EntityType = "Robot",
            EntityId = robot.Id.ToString("D"),
            ResultCode = "SUCCESS",
            OccurredAt = robot.CreatedAt,
            Robot = robot
        });

        return new PhysicalRobotOption(robot.Id, robot.RobotCode, robot.DisplayName);
    }
}
