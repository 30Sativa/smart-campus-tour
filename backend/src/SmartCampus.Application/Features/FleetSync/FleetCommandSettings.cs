namespace SmartCampus.Application.Features.FleetSync;

/// <summary>
/// The <c>FleetCommands</c> section of ADR-0042. M2.1 has no command transport, so <c>Enabled = true</c> is refused
/// when the settings are built: a deployed backend can never send a movement command or pretend a Tour is running.
/// </summary>
public sealed class FleetCommandSettings
{
    public FleetCommandSettings(bool enabled = false, int maxTelemetryAgeSeconds = 2, int startLateLimitMinutes = 15)
    {
        if (enabled)
            throw new InvalidOperationException(
                "FleetCommands:Enabled = true không được hỗ trợ: M2.1 chưa có command transport. Đặt FleetCommands:Enabled = false.");
        if (maxTelemetryAgeSeconds <= 0)
            throw new InvalidOperationException("FleetCommands:MaxTelemetryAgeSeconds must be positive.");
        if (startLateLimitMinutes < 0)
            throw new InvalidOperationException("FleetCommands:StartLateLimitMinutes must not be negative.");
        MaxTelemetryAge = TimeSpan.FromSeconds(maxTelemetryAgeSeconds);
        StartLateLimit = TimeSpan.FromMinutes(startLateLimitMinutes);
    }

    /// <summary>Always false in M2.1; see the constructor.</summary>
    public bool Enabled => false;
    /// <summary>Latest telemetry must have been received by the server no longer ago than this (SRS §7).</summary>
    public TimeSpan MaxTelemetryAge { get; }
    /// <summary>Start is accepted in [ScheduledStartAt, ScheduledStartAt + this] (ADR-0042 §7, D2).</summary>
    public TimeSpan StartLateLimit { get; }
}
