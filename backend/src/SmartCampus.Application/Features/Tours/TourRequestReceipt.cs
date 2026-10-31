using System.Security.Cryptography;
using System.Text.Json;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Tours;

internal static class TourRequestReceipt
{
    public static string Fingerprint(string action, Guid? tour, object? input = null, string? routeVersion = null, string? reason = null) =>
        Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new { action, tour, input, routeVersion, reason })));

    public static async Task<Guid?> ReplayAsync(ITourManagementRepository repository, Guid actor, Guid requestId,
        string action, Guid? tour, string fingerprint, CancellationToken ct)
    {
        await repository.LockRequestAsync(actor, requestId, ct);
        var audit = await repository.FindRequestAsync(actor, requestId, ct);
        if (audit is null) return null;
        using var json = JsonDocument.Parse(audit.DataJson!);
        if (audit.Action != action || (tour.HasValue && audit.TourId != tour) ||
            !json.RootElement.TryGetProperty("fingerprint", out var stored) || stored.GetString() != fingerprint)
            throw new ConflictException("Mã yêu cầu đã được dùng cho nội dung hoặc thao tác Tour khác.", "IDEMPOTENCY_CONFLICT");
        return audit.TourId;
    }

    public static void Append(ITourManagementRepository repository, Tour tour, Guid actor, Guid requestId,
        string action, string fingerprint, DateTimeOffset now, params string[] changedFields) => repository.AddAudit(new AuditLog
        {
            TourId = tour.Id, ActorUserId = actor, CorrelationId = requestId,
            EntityType = "Tour", EntityId = tour.Id.ToString("D"), Action = action,
            ResultCode = "SUCCESS", OccurredAt = now, DataJson = JsonSerializer.Serialize(new { fingerprint, changedFields })
        });
}
