using FluentValidation.TestHelper;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.UnitTests;

public sealed class PhysicalRobotRegistrationTests
{
    private static readonly Guid ActorId = Guid.NewGuid();
    private static readonly DateTimeOffset Now = new(2026, 10, 29, 4, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Validator_accepts_trimmed_fleet_codes_and_enforces_robot_code_rules()
    {
        var validator = new RegisterPhysicalRobotCommandValidator();
        var valid = new RegisterPhysicalRobotCommand(ActorId,
            new RegisterPhysicalRobotRequest($" {new string('a', 97)}._- ", new string('N', 150)));
        var invalidCode = valid with { Request = valid.Request with { RobotCode = "_starts-wrong" } };
        var tooLongCode = valid with { Request = valid.Request with { RobotCode = new string('a', 101) } };
        var tooLongName = valid with { Request = valid.Request with { DisplayName = new string('N', 151) } };

        Assert.True(validator.TestValidate(valid).IsValid);
        Assert.True(validator.TestValidate(invalidCode).ShouldHaveValidationErrorFor(command => command.Request.RobotCode).Any());
        Assert.True(validator.TestValidate(tooLongCode).ShouldHaveValidationErrorFor(command => command.Request.RobotCode).Any());
        Assert.True(validator.TestValidate(tooLongName).ShouldHaveValidationErrorFor(command => command.Request.DisplayName).Any());
    }

    [Fact]
    public async Task Handler_creates_only_unassigned_physical_identity_and_actor_time_audit()
    {
        var repository = new PhysicalRobotRepository();
        var handler = new RegisterPhysicalRobotCommandHandler(repository, new FixedTimeProvider(Now));

        var result = await handler.Handle(new RegisterPhysicalRobotCommand(ActorId,
            new RegisterPhysicalRobotRequest("  amr_01  ", "  Main Robot  ")), default);

        Assert.Equal(repository.Robot!.Id, result.Id);
        Assert.Equal("amr_01", result.RobotCode);
        Assert.Equal("Main Robot", result.DisplayName);
        Assert.Equal("PHYSICAL", repository.Robot.SourceType);
        Assert.Empty(repository.Robot.CredentialHash);
        Assert.False(repository.Robot.IsDispatchEnabled);
        Assert.False(repository.Robot.NeedsInspection);
        Assert.Null(repository.Robot.CurrentTourId);
        Assert.Null(repository.Robot.LastAssignedAt);
        Assert.Equal(Now, repository.Robot.CreatedAt);
        Assert.Equal(ActorId, repository.Audit!.ActorUserId);
        Assert.Equal(repository.Robot.Id, repository.Audit.RobotId);
        Assert.Equal(Now, repository.Audit.OccurredAt);
        Assert.Equal("PHYSICAL_ROBOT_REGISTERED", repository.Audit.Action);
    }

    [Fact]
    public async Task Handler_returns_a_conflict_when_code_exists_before_writing()
    {
        var repository = new PhysicalRobotRepository { CodeExists = true };
        var handler = new RegisterPhysicalRobotCommandHandler(repository, new FixedTimeProvider(Now));

        var conflict = await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(new RegisterPhysicalRobotCommand(ActorId,
            new RegisterPhysicalRobotRequest("amr_01", "Main Robot")), default));

        Assert.Equal("ROBOT_CODE_CONFLICT", conflict.Code);
        Assert.Null(repository.Robot);
        Assert.Null(repository.Audit);
    }

    private sealed class PhysicalRobotRepository : IPhysicalRobotRepository
    {
        public bool CodeExists { get; init; }
        public Robot? Robot { get; private set; }
        public AuditLog? Audit { get; private set; }

        public Task<IReadOnlyList<Robot>> ListPhysicalRobotsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Robot>>([]);

        public Task<bool> RobotCodeExistsAsync(string robotCode, CancellationToken cancellationToken) =>
            Task.FromResult(CodeExists);

        public void Add(Robot robot) => Robot = robot;
        public void AddAuditLog(AuditLog auditLog) => Audit = auditLog;
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
