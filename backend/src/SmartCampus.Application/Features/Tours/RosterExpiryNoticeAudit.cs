using System.Text.Json;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>What one registration lost at T-24h: counts only, so the queue row holds no address or name.</summary>
public sealed record RosterExpiryNoticeItem(Guid RegistrationId, int ExpiredRows, int ExpiredEmailChanges);

/// <summary>The durable queue of the T-24h notice, on AuditLogs like the cancellation notice (ADR-0047, ADR-0048).</summary>
public static class RosterExpiryNoticeAudit
{
    public const string Expired = "ROSTER_PENDING_EXPIRED";
    public const string Requested = "ROSTER_EXPIRY_NOTICE_REQUESTED";
    public const string Started = "ROSTER_EXPIRY_NOTICE_STARTED";
    public const string Sent = "ROSTER_EXPIRY_NOTICE_SENT";
    public const string Failed = "ROSTER_EXPIRY_NOTICE_FAILED";

    public static AuditLog Request(Guid tour, IReadOnlyCollection<RosterExpiryNoticeItem> items, DateTimeOffset now) =>
        TourCancelNoticeAudit.Create(tour, null, Requested, Guid.NewGuid(), now, "PENDING", new { items });

    public static RosterExpiryNoticeItem[] Items(AuditLog request) =>
        JsonSerializer.Deserialize<JsonElement>(request.DataJson!).GetProperty("items")
            .Deserialize<RosterExpiryNoticeItem[]>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
}
