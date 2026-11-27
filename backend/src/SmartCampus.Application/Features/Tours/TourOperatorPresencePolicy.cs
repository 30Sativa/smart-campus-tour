using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Tours;

public static class TourOperatorPresencePolicy
{
    public const string StillConnected = "OPERATOR_STILL_CONNECTED";
    public static bool CanEndAsBackup(DateTimeOffset? lastSeen, DateTimeOffset now, int minutes) =>
        lastSeen is null || now - lastSeen.Value >= TimeSpan.FromMinutes(minutes);

    public static void EnsureBackupAllowed(DateTimeOffset? lastSeen, DateTimeOffset now, int minutes)
    {
        if (CanEndAsBackup(lastSeen, now, minutes)) return;
        throw new ConflictException(
            $"Người vận hành vẫn đang kết nối (lần cuối {lastSeen!.Value.ToOffset(TimeSpan.FromHours(7)):HH:mm:ss}). Chỉ kết thúc sớm thay được sau {minutes} phút mất kết nối.",
            StillConnected, new Dictionary<string, string[]>
            {
                ["operatorLastSeenAt"] = [lastSeen.Value.ToString("O")],
                ["allowedAt"] = [lastSeen.Value.AddMinutes(minutes).ToString("O")]
            });
    }
}
