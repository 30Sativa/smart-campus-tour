using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Invitations;

public sealed record InvitationCodeGuardSettings(int MaxFailures = 5, int WindowMinutes = 10, int LockMinutes = 15);

/// <summary>
/// FR-45, section 7.3 decision 10: wrong attempts per (access code, source IP). In memory on the single API instance, so a
/// restart forgets it (ADR-0048). Keeps a hash of the code only.
/// </summary>
public sealed class InvitationCodeGuard(InvitationCodeGuardSettings settings, TimeProvider clock)
{
    public const string LockedCode = "INVITATION_CODE_LOCKED";
    private const int PruneAbove = 10_000;
    private sealed record Entry(int Failures, DateTimeOffset WindowStartedAt, DateTimeOffset? LockedUntil);
    private readonly Dictionary<(string Code, string Ip), Entry> entries = [];
    private readonly Lock gate = new();

    public void EnsureNotLocked(byte[] codeHash, string? ip)
    {
        var now = clock.GetUtcNow();
        lock (gate)
        {
            if (!entries.TryGetValue(Key(codeHash, ip), out var entry) || entry.LockedUntil is not { } until || until <= now) return;
            var minutes = (int)Math.Ceiling((until - now).TotalMinutes);
            throw new TooManyRequestsException($"Bạn đã nhập sai mã quá nhiều lần. Vui lòng thử lại sau khoảng {minutes} phút.", LockedCode);
        }
    }

    public void RecordFailure(byte[] codeHash, string? ip)
    {
        var now = clock.GetUtcNow();
        var key = Key(codeHash, ip);
        lock (gate)
        {
            if (entries.Count > PruneAbove) Prune(now);
            var window = TimeSpan.FromMinutes(settings.WindowMinutes);
            var fresh = !entries.TryGetValue(key, out var entry) || entry.LockedUntil <= now || (entry.LockedUntil is null && now - entry.WindowStartedAt >= window);
            var failures = fresh ? 1 : entry!.Failures + 1;
            entries[key] = new(failures, fresh ? now : entry!.WindowStartedAt,
                failures >= settings.MaxFailures ? now.AddMinutes(settings.LockMinutes) : null);
        }
    }

    public void Clear(byte[] codeHash, string? ip)
    {
        lock (gate) entries.Remove(Key(codeHash, ip));
    }

    private void Prune(DateTimeOffset now)
    {
        var window = TimeSpan.FromMinutes(settings.WindowMinutes);
        foreach (var (key, entry) in entries.ToArray())
            if (entry.LockedUntil is { } until ? until <= now : now - entry.WindowStartedAt >= window) entries.Remove(key);
    }

    private static (string, string) Key(byte[] codeHash, string? ip) => (Convert.ToBase64String(codeHash), ip ?? "unknown");
}
