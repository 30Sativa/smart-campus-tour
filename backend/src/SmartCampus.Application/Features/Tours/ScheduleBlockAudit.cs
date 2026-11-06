using System.Security.Cryptography;
using System.Text.Json;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

/// <summary>The audit row of a block change doubles as its idempotency receipt, as a Tour's does (TourRequestReceipt).</summary>
public static class ScheduleBlockAudit
{
    public const string EntityType = "TourScheduleBlock";
    public const string Created = "SCHEDULE_BLOCK_CREATED";
    public const string Removed = "SCHEDULE_BLOCK_REMOVED";

    internal static string Fingerprint(string action, object input) =>
        Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new { action, input })));

    /// <summary>The block a committed retry already acted on; null for a new request.</summary>
    internal static async Task<Guid?> ReplayAsync(IScheduleBlockRepository blocks, Guid actor, Guid requestId, string action, string fingerprint, CancellationToken ct)
    {
        await blocks.LockRequestAsync(actor, requestId, ct);
        var audit = await blocks.FindRequestAsync(actor, requestId, ct);
        if (audit is null) return null;
        using var json = JsonDocument.Parse(audit.DataJson!);
        if (audit.Action != action || !json.RootElement.TryGetProperty("fingerprint", out var stored) || stored.GetString() != fingerprint)
            throw new ConflictException("Mã yêu cầu đã được dùng cho nội dung khác.", "IDEMPOTENCY_CONFLICT");
        return Guid.Parse(audit.EntityId);
    }

    internal static void Append(IScheduleBlockRepository blocks, TourScheduleBlock block, Guid actor, Guid requestId, string action, string fingerprint, DateTimeOffset now) =>
        blocks.AddAudit(new AuditLog
        {
            ActorUserId = actor, CorrelationId = requestId, EntityType = EntityType, EntityId = block.Id.ToString("D"), Action = action,
            ResultCode = "SUCCESS", OccurredAt = now,
            DataJson = JsonSerializer.Serialize(new { fingerprint, date = block.BlockDate.ToString("yyyy-MM-dd"), shiftCode = block.ShiftCode, reason = block.Reason })
        });
}
