using System.Text.Json;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Invitations;

public static class InvitationAudit
{
    public const string Requested = "EMAIL_SEND_REQUESTED";
    public const string Started = "EMAIL_SEND_STARTED";
    public const string Result = "EMAIL_SEND_RESULT";
    public static AuditLog Create(Guid tour, Guid? actor, string action, string entityId, Guid correlation,
        DateTimeOffset now, string? result = null, object? data = null, string entityType = "Invitation") =>
        new() { TourId = tour, ActorUserId = actor, Action = action, EntityType = entityType, EntityId = entityId,
            CorrelationId = correlation, OccurredAt = now, ResultCode = result,
            DataJson = data is null ? null : JsonSerializer.Serialize(data) };
    public static AuditLog Request(Invitation invitation, Guid tour, Guid actor, DateTimeOffset now) =>
        Create(tour, actor, Requested, invitation.Id.ToString("D"), Guid.NewGuid(), now, "PENDING",
            new { accessVersion = invitation.AccessVersion });
    public static int Version(AuditLog audit) => JsonSerializer.Deserialize<JsonElement>(audit.DataJson!).GetProperty("accessVersion").GetInt32();
}
