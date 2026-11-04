namespace SmartCampus.Application.Features.FleetSync;

/// <summary>
/// The <c>FleetCommands</c> section of ADR-0042. Off by default: while <see cref="Enabled"/> is false Start refuses and no
/// command row is written. Turning it on does not move a physical robot by itself: <c>IsDispatchEnabled</c> has no writer
/// before M2.3.
/// </summary>
public sealed class FleetCommandSettings
{
    public FleetCommandSettings(bool enabled = false, int maxTelemetryAgeSeconds = 2, int startLateLimitMinutes = 15,
        int acceptWindowSeconds = 30)
    {
        if (maxTelemetryAgeSeconds <= 0)
            throw new InvalidOperationException("FleetCommands:MaxTelemetryAgeSeconds must be positive.");
        if (startLateLimitMinutes < 0)
            throw new InvalidOperationException("FleetCommands:StartLateLimitMinutes must not be negative.");
        if (acceptWindowSeconds <= 0)
            throw new InvalidOperationException("FleetCommands:AcceptWindowSeconds must be positive.");
        Enabled = enabled;
        MaxTelemetryAge = TimeSpan.FromSeconds(maxTelemetryAgeSeconds);
        StartLateLimit = TimeSpan.FromMinutes(startLateLimitMinutes);
        AcceptWindow = TimeSpan.FromSeconds(acceptWindowSeconds);
    }

    public bool Enabled { get; }
    /// <summary>Latest telemetry must have been received by the server no longer ago than this (SRS §7).</summary>
    public TimeSpan MaxTelemetryAge { get; }
    /// <summary>Start is accepted in [ScheduledStartAt, ScheduledStartAt + this] (ADR-0042 §7, D2).</summary>
    public TimeSpan StartLateLimit { get; }
    /// <summary>A GoTo's AcceptBy is its issue time plus this. Initial value, not measured yet.</summary>
    public TimeSpan AcceptWindow { get; }
}
