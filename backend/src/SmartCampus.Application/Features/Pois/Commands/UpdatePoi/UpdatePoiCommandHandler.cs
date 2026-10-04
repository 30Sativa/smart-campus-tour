using System.Text.Json;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Pois.Commands.CreatePoi;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Pois.Commands.UpdatePoi;

public sealed class UpdatePoiCommandHandler(
    IPoiManagementRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<UpdatePoiCommand, Unit>
{
    public async Task<Unit> Handle(UpdatePoiCommand command, CancellationToken cancellationToken)
    {
        var poi = await repository.FindForManagementAsync(command.Id, cancellationToken)
            ?? throw new NotFoundException("POI was not found.");
        EnsureCurrentVersion(poi.RowVersion, command.Request.ExpectedRowVersion);

        var usage = await repository.GetManagementStateAsync(poi.Id, cancellationToken);
        if (!usage.CanEditContentAndAvailability)
            throw new ConflictException("A POI used by a READY or RUNNING Tour cannot be changed.");

        var request = command.Request;
        var nextName = request.Name.Trim();
        var nextDescription = CreatePoiCommandHandler.Optional(request.Description);
        var nextMapKey = request.MapKey.Trim();
        var nextMapFrame = request.MapFrame.Trim();
        var nextNarration = CreatePoiCommandHandler.Optional(request.NarrationText);
        var nextAudioUrl = CreatePoiCommandHandler.Optional(request.AudioUrl);
        var nextFallbackVideoUrl = CreatePoiCommandHandler.Optional(request.FallbackVideoUrl);
        var poseChanged = poi.MapKey != nextMapKey || poi.MapFrame != nextMapFrame ||
            poi.X != request.X || poi.Y != request.Y || poi.Yaw != request.Yaw;
        if (poseChanged && !usage.CanEditPose)
            throw new ConflictException("Map and pose are locked after a POI is referenced by a route or tour history.");

        var changedFields = new List<string>();
        poi.Name = Set(poi.Name, nextName, "name", changedFields);
        poi.Description = Set(poi.Description, nextDescription, "description", changedFields);
        poi.MapKey = Set(poi.MapKey, nextMapKey, "mapKey", changedFields);
        poi.MapFrame = Set(poi.MapFrame, nextMapFrame, "mapFrame", changedFields);
        poi.X = Set(poi.X, request.X, "x", changedFields);
        poi.Y = Set(poi.Y, request.Y, "y", changedFields);
        poi.Yaw = Set(poi.Yaw, request.Yaw, "yaw", changedFields);
        poi.NarrationText = Set(poi.NarrationText, nextNarration, "narrationText", changedFields);
        poi.AudioUrl = Set(poi.AudioUrl, nextAudioUrl, "audioUrl", changedFields);
        poi.NarrationSeconds = Set(poi.NarrationSeconds, request.NarrationSeconds, "narrationSeconds", changedFields);
        poi.FallbackVideoUrl = Set(poi.FallbackVideoUrl, nextFallbackVideoUrl, "fallbackVideoUrl", changedFields);

        if (changedFields.Count == 0)
            return Unit.Value;

        var now = timeProvider.GetUtcNow();
        poi.UpdatedAt = now;
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_UPDATED",
            EntityType = "Poi",
            EntityId = poi.Id.ToString("D"),
            ResultCode = "SUCCESS",
            DataJson = JsonSerializer.Serialize(new { changedFields }),
            OccurredAt = now
        });

        return Unit.Value;
    }

    private static void EnsureCurrentVersion(byte[] current, string expected)
    {
        if (!current.AsSpan().SequenceEqual(PoiRowVersion.Decode(expected)))
            throw new ConflictException("This POI changed since it was loaded. Reload it and try again.");
    }

    private static T Set<T>(T current, T value, string field, ICollection<string> changed)
    {
        if (!EqualityComparer<T>.Default.Equals(current, value))
            changed.Add(field);
        return value;
    }
}
