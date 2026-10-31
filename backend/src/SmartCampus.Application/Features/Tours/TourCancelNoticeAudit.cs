using System.Text.Json;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>
/// The cancellation notice's durable queue, on AuditLogs like ADR-0015 invitations: the request row commits with the
/// cancel, so a rollback or a replay queues nothing. Rows hold registration ids and counts, never addresses or email text.
/// </summary>
public static class TourCancelNoticeAudit
{
    public const string Requested = "TOUR_CANCEL_NOTICE_REQUESTED";
    public const string Started = "TOUR_CANCEL_NOTICE_STARTED";
    public const string Sent = "TOUR_CANCEL_NOTICE_SENT";
    public const string Failed = "TOUR_CANCEL_NOTICE_FAILED";

    public static AuditLog Request(Guid tour, Guid? actor, IReadOnlyCollection<Guid> registrationIds, DateTimeOffset now) =>
        Create(tour, actor, Requested, Guid.NewGuid(), now, "PENDING", new { registrationIds });

    public static AuditLog Create(Guid tour, Guid? actor, string action, Guid attempt, DateTimeOffset now, string result, object? data = null,
        string entityType = "Tour", string? entityId = null) => new()
        {
            TourId = tour, ActorUserId = actor, Action = action, EntityType = entityType, EntityId = entityId ?? tour.ToString("D"),
            CorrelationId = attempt, OccurredAt = now, ResultCode = result, DataJson = data is null ? null : JsonSerializer.Serialize(data)
        };

    public static Guid[] RegistrationIds(AuditLog request) =>
        JsonSerializer.Deserialize<JsonElement>(request.DataJson!).GetProperty("registrationIds").Deserialize<Guid[]>()!;
}
