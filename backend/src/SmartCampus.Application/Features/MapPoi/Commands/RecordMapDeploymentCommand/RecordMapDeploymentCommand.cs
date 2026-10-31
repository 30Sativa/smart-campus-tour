using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record RecordMapDeploymentCommand(Guid ActorUserId, Guid MapVersionId, RecordMapDeploymentRequest Request)
    : IPoiMutationCommand<MapDeploymentCheckView>;

public sealed class RecordMapDeploymentCommandValidator : AbstractValidator<RecordMapDeploymentCommand>
{
    public RecordMapDeploymentCommandValidator()
    {
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.RobotCode).NotEmpty().MaximumLength(100);
        RuleFor(command => command.Request.PackageSha256).Length(64).Matches("^[0-9a-fA-F]{64}$");
        RuleFor(command => command.Request.EvidenceNote).NotEmpty().MaximumLength(2000);
        RuleFor(command => command.ActorUserId).NotEmpty();
    }
}

public sealed class RecordMapDeploymentCommandHandler(
    IMapVersionRepository repository,
    IMapPoiRequestLock requestLock,
    TimeProvider timeProvider)
    : IRequestHandler<RecordMapDeploymentCommand, MapDeploymentCheckView>
{
    public async Task<MapDeploymentCheckView> Handle(RecordMapDeploymentCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var checksum = Convert.FromHexString(request.PackageSha256);
        var requestHash = MapPoiRequestHash.Compute(new
        {
            command.MapVersionId,
            request.RobotCode,
            PackageSha256 = request.PackageSha256.ToLowerInvariant(),
            request.LocalizationPassed,
            request.DisplayPassed,
            EvidenceNote = request.EvidenceNote.Trim()
        });
        await requestLock.LockRequestAsync(command.ActorUserId, request.RequestId, "deployment-check", cancellationToken);
        var prior = await repository.FindDeploymentRequestAsync(command.ActorUserId, request.RequestId, cancellationToken);
        if (prior is not null)
        {
            MapPoiRequestIdempotency.EnsureSameRequest(prior.RequestHash, requestHash);
            return MapPoiReadModelMapper.ToDeploymentView(prior);
        }

        var map = await repository.FindMapVersionAsync(command.MapVersionId, includePackage: false, cancellationToken)
            ?? throw new NotFoundException("Map version", command.MapVersionId);
        if (!CryptographicOperations.FixedTimeEquals(map.PackageSha256, checksum))
            throw new ConflictException("Deployment evidence must name the exact uploaded package checksum.", "MAP_CHECKSUM_MISMATCH");
        var robot = await repository.FindPhysicalRobotAsync(request.RobotCode.Trim(), cancellationToken)
            ?? throw new NotFoundException("Physical robot", request.RobotCode.Trim());
        await repository.LockMapPreparationStateAsync(map.Id, cancellationToken);
        await repository.LockRobotDeploymentStateAsync(robot.Id, cancellationToken);
        RobotLifecycleRules.EnsureActive(robot);
        var connectionConfirmed = await repository.LockAndReadConnectionConfirmationAsync(robot.Id, cancellationToken);
        if (request.LocalizationPassed && request.DisplayPassed && !connectionConfirmed)
            throw new ConflictException(
                "Robot chưa xác nhận kết nối. Hãy chạy bridge Fleet Sync bằng khóa hiện tại rồi thử ghi PASS lại.",
                "ROBOT_CONNECTION_UNCONFIRMED");
        var latestDeployment = await repository.GetLatestDeploymentCheckForRobotAsync(robot.Id, cancellationToken);
        var now = timeProvider.GetUtcNow();
        if (latestDeployment is not null && now < latestDeployment.CheckedAt.AddMilliseconds(1))
            now = latestDeployment.CheckedAt.AddMilliseconds(1);
        var check = new MapDeploymentCheck
        {
            Id = Guid.NewGuid(),
            MapVersionId = map.Id,
            RobotId = robot.Id,
            PackageSha256 = checksum,
            LocalizationPassed = request.LocalizationPassed,
            DisplayPassed = request.DisplayPassed,
            EvidenceNote = request.EvidenceNote.Trim(),
            CheckedByUserId = command.ActorUserId,
            RequestId = request.RequestId,
            RequestHash = requestHash,
            CheckedAt = now
        };
        repository.Add(check);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            RobotId = robot.Id,
            Action = "MAP_DEPLOYMENT_CHECK_RECORDED",
            EntityType = "MapVersion",
            EntityId = map.Id.ToString("D"),
            ResultCode = check.LocalizationPassed && check.DisplayPassed ? "PASS" : "FAIL",
            DataJson = JsonSerializer.Serialize(new { robot.RobotCode, packageSha256 = request.PackageSha256.ToLowerInvariant(), check.LocalizationPassed, check.DisplayPassed }),
            OccurredAt = now
        });
        check.Robot = robot;
        return MapPoiReadModelMapper.ToDeploymentView(check);
    }
}
