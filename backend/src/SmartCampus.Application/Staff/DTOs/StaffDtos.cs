namespace SmartCampus.Application.Staff.DTOs
{
    public sealed class StaffDashboardDto
    {
        public int TodayTours { get; init; }
        public int UpcomingTours { get; init; }
        public int ActiveTours { get; init; }
        public int CompletedTours { get; init; }
        public int PendingTours { get; init; }
        public int ActiveAmrs { get; init; }
        public int OfflineAmrs { get; init; }
        public int ActiveAlerts { get; init; }
        public int CriticalAlerts { get; init; }
        public List<StaffScheduleItemDto> TodaySchedule { get; init; } = [];
        public List<AmrStatusDto> ActiveAmrsList { get; init; } = [];
        public List<AlertDto> RecentAlerts { get; init; } = [];
        public List<TourSessionSummaryDto> ActiveSessions { get; init; } = [];
    }

    public sealed class StaffScheduleItemDto
    {
        public Guid SessionId { get; init; }
        public Guid BookingId { get; init; }
        public DateTime StartTime { get; init; }
        public DateTime EndTime { get; init; }
        public string RouteName { get; init; } = string.Empty;
        public string VisitorName { get; init; } = string.Empty;
        public string Status { get; init; } = string.Empty;
        public string? AmrName { get; init; }
    }

    public sealed class TourSessionSummaryDto
    {
        public Guid Id { get; init; }
        public string Status { get; init; } = string.Empty;
        public string RouteName { get; init; } = string.Empty;
        public DateTime StartTime { get; init; }
        public string? AmrName { get; init; }
        public string? MissionState { get; init; }
        public int? ProgressPercent { get; init; }
    }

    public sealed class TourSessionDetailDto
    {
        public Guid Id { get; init; }
        public Guid BookingId { get; init; }
        public string Status { get; init; } = string.Empty;
        public string RouteName { get; init; } = string.Empty;
        public DateTime StartTime { get; init; }
        public DateTime EndTime { get; init; }
        public string VisitorName { get; init; } = string.Empty;
        public string? AmrName { get; init; }
        public MissionDto? Mission { get; init; }
        public List<TimelineEventDto> Timeline { get; init; } = [];
        public List<AlertDto> Alerts { get; init; } = [];
        public List<AssignmentDto> Assignments { get; init; } = [];
    }

    public sealed class MissionDto
    {
        public Guid Id { get; init; }
        public Guid AmrUnitId { get; init; }
        public string State { get; init; } = string.Empty;
        public int ProgressPercent { get; init; }
        public string? CurrentWaypoint { get; init; }
        public string? NextWaypoint { get; init; }
        public string? FailureReason { get; init; }
        public string? CorrelationId { get; init; }
        public DateTime? StartedAt { get; init; }
    }

    public sealed class AmrStatusDto
    {
        public Guid Id { get; init; }
        public string Name { get; init; } = string.Empty;
        public string OperationalState { get; init; } = string.Empty;
        public string ConnectionState { get; init; } = string.Empty;
        public double BatteryPercent { get; init; }
        public double? Latitude { get; init; }
        public double? Longitude { get; init; }
        public DateTime? LastSeenAt { get; init; }
        public double? TelemetryAgeSeconds { get; init; }
        public string SensorHealth { get; init; } = string.Empty;
        public Guid? CurrentSessionId { get; init; }
        public string? CurrentSessionStatus { get; init; }
        public string? CurrentMissionState { get; init; }
        public string? CurrentPoi { get; init; }
    }

    public sealed class AlertDto
    {
        public Guid Id { get; init; }
        public string Type { get; init; } = string.Empty;
        public string Severity { get; init; } = string.Empty;
        public string Message { get; init; } = string.Empty;
        public Guid? AmrUnitId { get; init; }
        public string? AmrName { get; init; }
        public Guid? TourSessionId { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime? AcknowledgedAt { get; init; }
        public string? AcknowledgedBy { get; init; }
        public string? ResolutionNote { get; init; }
        public DateTime? ResolvedAt { get; init; }
    }

    public sealed class TimelineEventDto
    {
        public Guid Id { get; init; }
        public string Type { get; init; } = string.Empty;
        public string? Detail { get; init; }
        public DateTime OccurredAt { get; init; }
    }

    public sealed class AssignmentDto
    {
        public Guid Id { get; init; }
        public Guid AmrUnitId { get; init; }
        public string AmrName { get; init; } = string.Empty;
        public string Status { get; init; } = string.Empty;
        public string AssignedBy { get; init; } = string.Empty;
        public string? Reason { get; init; }
        public DateTime AssignedAt { get; init; }
        public DateTime? ClosedAt { get; init; }
    }

    public sealed class AssignmentRequest
    {
        public Guid AmrUnitId { get; init; }
        public string? Reason { get; init; }
    }

    public sealed class MissionCommandRequest
    {
        public string? Reason { get; init; }
    }

    public sealed class AcknowledgeAlertRequest
    {
        public string? ResolutionNote { get; init; }
    }

    public sealed class FeedbackReportDto
    {
        public Guid BookingId { get; init; }
        public string RouteName { get; init; } = string.Empty;
        public DateTime TourDate { get; init; }
        public string BookingStatus { get; init; } = string.Empty;
        public int? Rating { get; init; }
        public string? Comment { get; init; }
    }
}
