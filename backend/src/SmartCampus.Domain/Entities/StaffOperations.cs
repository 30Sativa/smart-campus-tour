namespace SmartCampus.Domain.Entities
{
    public enum AMRConnectionState { Live, Stale, Disconnected }
    public enum MissionState { Idle, Navigating, Paused, RecallRequested, Cancelled, EmergencyStopped, Failed, Completed }
    public enum AssignmentStatus { Active, Reassigned, Closed }
    public enum AlertType { TourDelay, StaleTelemetry, AMRDisconnected, LowBattery, NavigationFault, SensorFault, MissionFailure, PersistentObstacle, EmergencyStop }
    public enum AlertSeverity { Information, Warning, Critical }
    public enum TimelineEventType { Created, Assigned, Dispatched, Started, PoiArrived, Paused, Resumed, Recalled, Cancelled, Completed, Failed, EmergencyStopped }

    public class Mission
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid TourSessionId { get; set; }
        public Guid AMRUnitId { get; set; }
        public MissionState State { get; set; } = MissionState.Idle;
        public Guid? CurrentWaypointId { get; set; }
        public Guid? NextWaypointId { get; set; }
        public int ProgressPercent { get; set; }
        public string? FailureReason { get; set; }
        public string? LastCorrelationId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? StartedAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        public TourSession? TourSession { get; set; }
        public AMRUnit? AMRUnit { get; set; }
        public Waypoint? CurrentWaypoint { get; set; }
        public Waypoint? NextWaypoint { get; set; }
    }

    public class AMRAssignment
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid TourSessionId { get; set; }
        public Guid AMRUnitId { get; set; }
        public AssignmentStatus Status { get; set; } = AssignmentStatus.Active;
        public Guid AssignedByUserId { get; set; }
        public string? Reason { get; set; }
        public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ClosedAt { get; set; }

        public TourSession? TourSession { get; set; }
        public AMRUnit? AMRUnit { get; set; }
        public User? AssignedByUser { get; set; }
    }

    public class OperationalAlert
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public AlertType Type { get; set; }
        public AlertSeverity Severity { get; set; }
        public string Message { get; set; } = string.Empty;
        public Guid? AMRUnitId { get; set; }
        public Guid? TourSessionId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? AcknowledgedAt { get; set; }
        public Guid? AcknowledgedByUserId { get; set; }
        public string? ResolutionNote { get; set; }
        public DateTime? ResolvedAt { get; set; }

        public AMRUnit? AMRUnit { get; set; }
        public TourSession? TourSession { get; set; }
        public User? AcknowledgedByUser { get; set; }
    }

    public class AuditLog
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid ActorUserId { get; set; }
        public string ActorRole { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string TargetType { get; set; } = string.Empty;
        public Guid TargetId { get; set; }
        public string? BeforeState { get; set; }
        public string? AfterState { get; set; }
        public string Result { get; set; } = string.Empty;
        public string? Reason { get; set; }
        public string CorrelationId { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public User? ActorUser { get; set; }
    }

    public class TourTimelineEvent
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid TourSessionId { get; set; }
        public TimelineEventType Type { get; set; }
        public string? Detail { get; set; }
        public DateTime OccurredAt { get; set; } = DateTime.UtcNow;

        public TourSession? TourSession { get; set; }
    }
}
