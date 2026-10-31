using System.Security.Cryptography;
using System.Text;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Auth;

/// <summary>Single-instance, bounded account budget; complements the API's IP limiter without permanent lockout.</summary>
public sealed class LoginAttemptGate(TimeProvider clock)
{
    public const int AttemptsPerMinute = 10;
    private const int MaximumAccounts = 10_000;
    private readonly object sync = new();
    private readonly Dictionary<string, Window> windows = new(StringComparer.Ordinal);
    private DateTimeOffset nextPrune;

    public void Enter(string normalizedUsername)
    {
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalizedUsername)));
        lock (sync)
        {
            var now = clock.GetUtcNow();
            if (now >= nextPrune)
            {
                foreach (var expired in windows.Where(w => now - w.Value.Start >= TimeSpan.FromMinutes(1)).Select(w => w.Key).ToArray())
                    windows.Remove(expired);
                nextPrune = now.AddSeconds(10);
            }
            if (!windows.TryGetValue(key, out var window) || now - window.Start >= TimeSpan.FromMinutes(1))
            {
                if (window is null && windows.Count >= MaximumAccounts) throw Limited();
                window = new Window(now);
                windows[key] = window;
            }
            if (window.Attempts >= AttemptsPerMinute) throw Limited();
            window.Attempts++;
        }
    }

    private static TooManyRequestsException Limited() => new("Too many login attempts. Try again in a minute.");
    private sealed class Window(DateTimeOffset start)
    {
        public DateTimeOffset Start { get; } = start;
        public int Attempts { get; set; }
    }
}
