namespace SmartCampus.Application.Features.FleetSync;

/// <summary>
/// The <c>FleetCommands</c> section of ADR-0042. <see cref="Enabled"/> (off by default) only gates movement: while it is
/// false Start, Next and Retry refuse, so no GoTo row is written, and poll hands out no GoTo. Everything that makes the
/// robot safer keeps running: poll still checks the stream, applies the timeouts and delivers an open Cancel, results are
/// always recorded, and the sweeper and restart recovery always run. Turning it on does not move a physical robot by
/// itself: <c>IsDispatchEnabled</c> has no writer before M2.3.
/// </summary>
public sealed class FleetCommandSettings
{
    public FleetCommandSettings(bool enabled = false, int maxTelemetryAgeSeconds = 2, int startLateLimitMinutes = 15,
        int acceptWindowSeconds = 30, int legResultTimeoutSeconds = 600, int sweepIntervalSeconds = 5)
    {
        if (maxTelemetryAgeSeconds <= 0)
            throw new InvalidOperationException("FleetCommands:MaxTelemetryAgeSeconds must be positive.");
        if (startLateLimitMinutes < 0)
            throw new InvalidOperationException("FleetCommands:StartLateLimitMinutes must not be negative.");
        if (acceptWindowSeconds <= 0)
            throw new InvalidOperationException("FleetCommands:AcceptWindowSeconds must be positive.");
        if (legResultTimeoutSeconds <= 0)
            throw new InvalidOperationException("FleetCommands:LegResultTimeoutSeconds must be positive.");
        if (sweepIntervalSeconds <= 0)
            throw new InvalidOperationException("FleetCommands:SweepIntervalSeconds must be positive.");
        Enabled = enabled;
        MaxTelemetryAge = TimeSpan.FromSeconds(maxTelemetryAgeSeconds);
        StartLateLimit = TimeSpan.FromMinutes(startLateLimitMinutes);
        AcceptWindow = TimeSpan.FromSeconds(acceptWindowSeconds);
        LegResultTimeout = TimeSpan.FromSeconds(legResultTimeoutSeconds);
        SweepInterval = TimeSpan.FromSeconds(sweepIntervalSeconds);
    }

    public bool Enabled { get; }
    /// <summary>Latest telemetry must have been received by the server no longer ago than this (SRS §7).</summary>
    public TimeSpan MaxTelemetryAge { get; }
    /// <summary>Start is accepted in [ScheduledStartAt, ScheduledStartAt + this] (ADR-0042 §7, D2).</summary>
    public TimeSpan StartLateLimit { get; }
    /// <summary>A GoTo's AcceptBy is its issue time plus this. Initial value, not measured yet.</summary>
    public TimeSpan AcceptWindow { get; }
    /// <summary>An accepted GoTo with no terminal result after this is UNKNOWN. Initial value, not measured yet.</summary>
    public TimeSpan LegResultTimeout { get; }
    public TimeSpan SweepInterval { get; }
}
