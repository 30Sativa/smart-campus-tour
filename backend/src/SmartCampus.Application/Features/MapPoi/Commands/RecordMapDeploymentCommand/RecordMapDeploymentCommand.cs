using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.FallbackVideo;
using SmartCampus.Application.Features.FleetSync;
using SmartCampus.Application.Features.TechnicalEvidence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record RecordMapDeploymentCommand(Guid ActorUserId, Guid MapVersionId, RecordMapDeploymentRequest Request)
    : IPoiMutationCommand<MapDeploymentCheckView>, SmartCampus.Application.Features.StaffNotifications.IStaffNoticeCommand;

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
    IFleetTelemetryStore telemetryStore,
    FleetSyncSettings fleetSyncSettings,
    CloudinarySettings cloudinarySettings,
    TimeProvider timeProvider)
    : IRequestHandler<RecordMapDeploymentCommand, MapDeploymentCheckView>
{
    public async Task<MapDeploymentCheckView> Handle(RecordMapDeploymentCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var checksum = Convert.FromHexString(request.PackageSha256);
        var photos = TechnicalEvidencePhotos.Normalize(request.EvidencePhotoUrls, cloudinarySettings, command.ActorUserId);
        // ADR-0073: photos join the hash only when sent, so a request without them hashes as it did before.
        var requestHash = photos.Count == 0
            ? MapPoiRequestHash.Compute(new
            {
                command.MapVersionId,
                request.RobotCode,
                PackageSha256 = request.PackageSha256.ToLowerInvariant(),
                request.LocalizationPassed,
                request.DisplayPassed,
                EvidenceNote = request.EvidenceNote.Trim()
            })
            : MapPoiRequestHash.Compute(new
            {
                command.MapVersionId,
                request.RobotCode,
                PackageSha256 = request.PackageSha256.ToLowerInvariant(),
                request.LocalizationPassed,
                request.DisplayPassed,
                EvidenceNote = request.EvidenceNote.Trim(),
                EvidencePhotoUrls = photos
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
        await MapRetirement.EnsureActiveAsync(repository, map.Id, cancellationToken);
        await repository.LockRobotDeploymentStateAsync(robot.Id, cancellationToken);
        RobotLifecycleRules.EnsureActive(robot);
        // ADR-0066: a check (PASS or FAIL) on a map the robot does not hold would become its newest check and take it off
        // its real map. Read again behind the lock, which assignment changes take too.
        var current = await repository.ReadRobotForReadinessAsync(robot.Id, cancellationToken)
            ?? throw new NotFoundException("Physical robot", robot.RobotCode);
        if (current.AssignedMapVersionId != map.Id)
            throw new ConflictException(
                $"{RobotMapReadiness.NotAssignedMessage(current)} Đổi bản đồ cho robot ở trang Robot trước khi ghi kiểm tra.",
                RobotMapReadiness.MapNotAssignedCode);
        var passed = request.LocalizationPassed && request.DisplayPassed;
        var connectionConfirmed = await repository.LockAndReadConnectionConfirmationAsync(robot.Id, cancellationToken);
        if (passed && !connectionConfirmed)
            throw new ConflictException(
                "Robot chưa xác nhận kết nối. Hãy chạy bridge Fleet Sync bằng khóa hiện tại rồi thử ghi PASS lại.",
                RobotMapReadiness.ConnectionUnconfirmedCode);
        // PASS needs live data sent on the assigned map since the assignment: Fleet Sync accepts only that map's key.
        var snapshot = telemetryStore.GetLatest()
            .FirstOrDefault(item => string.Equals(item.Robot.RobotCode, current.RobotCode, StringComparison.Ordinal));
        if (passed && !RobotMapReadiness.IsReportingOnAssignedMap(current, snapshot, timeProvider.GetUtcNow(), fleetSyncSettings))
            throw new ConflictException(
                $"Robot {current.RobotCode} chưa gửi dữ liệu theo bản đồ {map.AreaKeyNavigation.DisplayName} · v{map.VersionNumber}. " +
                $"Bật fleet_bridge với MapKey {map.MapKey}, FrameId {map.FrameId} rồi bấm Cập nhật trạng thái.",
                RobotMapReadiness.NotReportingCode);
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
            EvidencePhotoUrlsJson = TechnicalEvidencePhotos.Write(photos),
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
            DataJson = JsonSerializer.Serialize(new { robot.RobotCode, packageSha256 = request.PackageSha256.ToLowerInvariant(), check.LocalizationPassed, check.DisplayPassed, evidencePhotoCount = photos.Count }),
            OccurredAt = now
        });
        check.Robot = robot;
        return MapPoiReadModelMapper.ToDeploymentView(check);
    }
}
