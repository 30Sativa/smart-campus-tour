using System.Text.Json;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Pois.Commands.SetPoiAvailability;

public sealed class SetPoiAvailabilityCommandHandler(
    IPoiManagementRepository repository,
    TimeProvider timeProvider)
    : IRequestHandler<SetPoiAvailabilityCommand, Unit>
{
    public async Task<Unit> Handle(SetPoiAvailabilityCommand command, CancellationToken cancellationToken)
    {
        var poi = await repository.FindForManagementAsync(command.Id, cancellationToken)
            ?? throw new NotFoundException("POI was not found.");
        if (!poi.RowVersion.AsSpan().SequenceEqual(PoiRowVersion.Decode(command.ExpectedRowVersion)))
            throw new ConflictException("This POI changed since it was loaded. Reload it and try again.");

        var state = await repository.GetManagementStateAsync(poi.Id, cancellationToken);
        if (!state.CanEditContentAndAvailability)
            throw new ConflictException("A POI used by a READY or RUNNING Tour cannot be changed.");
        if (poi.IsActive == command.IsActive)
            return Unit.Value;

        var now = timeProvider.GetUtcNow();
        poi.IsActive = command.IsActive;
        poi.UpdatedAt = now;
        repository.AddAuditLog(new AuditLog
        {
            ActorUserId = command.ActorUserId,
            Action = command.IsActive ? "POI_ACTIVATED" : "POI_DEACTIVATED",
            EntityType = "Poi",
            EntityId = poi.Id.ToString("D"),
            ResultCode = "SUCCESS",
            DataJson = JsonSerializer.Serialize(new { changedFields = new[] { "isActive" }, isActive = command.IsActive }),
            OccurredAt = now
        });

        return Unit.Value;
    }
}
