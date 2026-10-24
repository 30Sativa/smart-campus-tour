using SmartCampus.Application.Common.Abstractions.FleetSync;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.FleetSync;

public enum FleetTelemetryTransition
{
    FirstReport,
    NewSequence,
    Duplicate,
    NewStream
}

/// <summary>Pure ordering rules for the transient fleet projection.</summary>
public static class FleetTelemetryOrderingPolicy
{
    public static FleetTelemetryTransition Decide(
        FleetTelemetrySnapshot? current,
        FleetTelemetrySnapshot incoming,
        IReadOnlySet<Guid> retiredStreamIds)
    {
        if (current is null)
        {
            // The projection and its ordering history are process-local. After
            // an API restart there is no sequence to compare against, so the
            // robot must be allowed to continue its existing stream at N+1.
            return FleetTelemetryTransition.FirstReport;
        }

        var report = incoming.Report;
        var latest = current.Report;
        if (latest.StreamId == report.StreamId)
        {
            if (report.Seq < latest.Seq)
                throw new ConflictException("Telemetry sequence is older than the latest report.", "OUT_OF_ORDER");

            if (report.Seq == latest.Seq)
            {
                if (report == latest)
                    return FleetTelemetryTransition.Duplicate;

                throw new ConflictException("A sequence number cannot identify different telemetry.", "SEQUENCE_REUSED");
            }

            if (report.ReportedAt < latest.ReportedAt)
                throw new ConflictException("A newer sequence cannot carry an older reportedAt timestamp.", "OUT_OF_ORDER");

            return FleetTelemetryTransition.NewSequence;
        }

        if (retiredStreamIds.Contains(report.StreamId))
            throw new ConflictException("This telemetry stream has already been replaced.", "STALE_STREAM");

        if (report.Seq != 1)
            throw new ConflictException("A new telemetry stream must start at sequence 1.", "STREAM_START_REQUIRED");

        if (report.ReportedAt < latest.ReportedAt)
            throw new ConflictException("A restarted stream must report a timestamp at least as new as the current stream.", "STALE_STREAM");

        return FleetTelemetryTransition.NewStream;
    }
}
