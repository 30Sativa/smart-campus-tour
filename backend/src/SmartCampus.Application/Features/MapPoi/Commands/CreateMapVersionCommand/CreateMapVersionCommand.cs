using System.Security.Cryptography;
using System.Text.Json;
using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.MapPoi;

public sealed record CreateMapVersionCommand(Guid ActorUserId, CreateMapVersionRequest Request)
    : IPoiMutationCommand<MapVersionView>;

public sealed class CreateMapVersionCommandValidator : AbstractValidator<CreateMapVersionCommand>
{
    public CreateMapVersionCommandValidator()
    {
        RuleFor(command => command.Request.AreaKey).NotEmpty().MaximumLength(80)
            .Matches("^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$");
        RuleFor(command => command.Request.AreaName).NotEmpty().MaximumLength(150);
        RuleFor(command => command.Request.RequestId).NotEmpty();
        RuleFor(command => command.Request.PackageBytes).NotEmpty()
            .Must(bytes => bytes.Length <= MapPackageValidator.MaxPackageBytes)
            .WithMessage($"Map package must not exceed {MapPackageValidator.MaxPackageBytes} bytes.");
    }
}

public sealed class CreateMapVersionCommandHandler(
    IMapVersionRepository repository,
    IMapPoiRequestLock requestLock,
    TimeProvider timeProvider)
    : IRequestHandler<CreateMapVersionCommand, MapVersionView>
{
    public async Task<MapVersionView> Handle(CreateMapVersionCommand command, CancellationToken cancellationToken)
    {
        var request = command.Request;
        var areaKey = request.AreaKey.Trim();
        var areaName = request.AreaName.Trim();
        var package = MapPackageValidator.Validate(request.PackageBytes);
        var requestHash = MapPoiRequestHash.Compute(new
        {
            AreaKey = areaKey,
            AreaName = areaName,
            Sha256 = Convert.ToHexString(package.Sha256)
        });

        await requestLock.LockRequestAsync(command.ActorUserId, request.RequestId, "map-upload", cancellationToken);
        var prior = await repository.FindMapUploadRequestAsync(command.ActorUserId, request.RequestId, cancellationToken);
        if (prior is not null)
        {
            MapPoiRequestIdempotency.EnsureSameRequest(prior.RequestHash, requestHash);
            return MapPoiReadModelMapper.ToMapView(prior, prior.AreaKeyNavigation.DisplayName);
        }

        var area = await repository.LockAreaAsync(areaKey, cancellationToken);
        if (area is null)
        {
            area = new MapArea
            {
                AreaKey = areaKey,
                DisplayName = areaName,
                CreatedByUserId = command.ActorUserId,
                CreatedAt = timeProvider.GetUtcNow()
            };
            repository.Add(area);
        }
        else if (!string.Equals(area.DisplayName, areaName, StringComparison.Ordinal))
        {
            throw new ConflictException("The area key already belongs to a different display name.");
        }

        var version = await repository.GetNextMapVersionAsync(areaKey, cancellationToken);
        var mapKey = $"{areaKey}-v{version}";
        var now = timeProvider.GetUtcNow();
        var metadata = package.Metadata;
        var mapVersion = new MapVersion
        {
            Id = Guid.NewGuid(),
            AreaKey = areaKey,
            VersionNumber = version,
            MapKey = mapKey,
            PackageFileName = $"{mapKey}.zip",
            PackageSha256 = package.Sha256,
            RequestHash = requestHash,
            PackageBytes = request.PackageBytes,
            ImageFileName = metadata.ImageFileName,
            ImageWidth = metadata.ImageWidth,
            ImageHeight = metadata.ImageHeight,
            Resolution = metadata.Resolution,
            OriginX = metadata.OriginX,
            OriginY = metadata.OriginY,
            OriginYaw = metadata.OriginYaw,
            Negate = metadata.Negate,
            OccupiedThreshold = metadata.OccupiedThreshold,
            FreeThreshold = metadata.FreeThreshold,
            FrameId = metadata.FrameId,
            ValidationStatus = "VALID",
            UploadedByUserId = command.ActorUserId,
            UploadRequestId = request.RequestId,
            UploadedAt = now
        };
        repository.Add(mapVersion);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "MAP_VERSION_UPLOADED",
            EntityType = "MapVersion",
            EntityId = mapVersion.Id.ToString("D"),
            ResultCode = "SUCCESS",
            DataJson = JsonSerializer.Serialize(new { areaKey, version, mapVersion.MapKey, sha256 = Convert.ToHexString(package.Sha256).ToLowerInvariant() }),
            OccurredAt = now
        });
        return MapPoiReadModelMapper.ToMapView(mapVersion, areaName);
    }


}
