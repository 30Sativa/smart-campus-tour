using System.Text.Json;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Routes;

internal static class RouteAudit
{
    public static void Append(IRouteManagementRepository repository, Guid actor, Route route,
        string action, DateTimeOffset now, params string[] changedFields) => repository.AddAudit(new AuditLog
        {
            ActorUserId = actor, EntityType = "Route", EntityId = route.Id.ToString("D"),
            Action = action, ResultCode = "SUCCESS", OccurredAt = now,
            DataJson = JsonSerializer.Serialize(new { changedFields })
        });
}
