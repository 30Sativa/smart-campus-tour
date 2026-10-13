using System.Text.Json;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Features.Pois.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Pois.Commands.CreatePoi;

public sealed class CreatePoiCommandHandler(
    IPoiManagementRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<CreatePoiCommand, CreatePoiResponse>
{
    public Task<CreatePoiResponse> Handle(CreatePoiCommand command, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var request = command.Request;
        var poi = new Poi
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Description = Optional(request.Description),
            MapKey = request.MapKey.Trim(),
            MapFrame = request.MapFrame.Trim(),
            X = request.X,
            Y = request.Y,
            Yaw = request.Yaw,
            NarrationText = Optional(request.NarrationText),
            AudioUrl = Optional(request.AudioUrl),
            NarrationSeconds = request.NarrationSeconds,
            FallbackVideoUrl = Optional(request.FallbackVideoUrl),
            IsActive = false,
            CreatedAt = now
        };

        repository.Add(poi);
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = "POI_CREATED",
            EntityType = "Poi",
            EntityId = poi.Id.ToString("D"),
            ResultCode = "SUCCESS",
            DataJson = JsonSerializer.Serialize(new
            {
                changedFields = new[] { "name", "description", "mapKey", "mapFrame", "x", "y", "yaw", "narrationText", "audioUrl", "narrationSeconds", "fallbackVideoUrl", "isActive" }
            }),
            OccurredAt = now
        });

        return Task.FromResult(new CreatePoiResponse(poi.Id));
    }

    internal static string? Optional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
