namespace SmartCampus.Domain.Entities
{
    public enum SlotStatus { Open, Closed, Full }
    public enum BookingStatus { Pending, Confirmed, Cancelled, Completed }
    public enum SessionStatus { Scheduled, Active, Paused, Completed, Cancelled, Failed }

    public class TimeSlot
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid RouteId { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public int Capacity { get; set; } = 10;
        public SlotStatus Status { get; set; } = SlotStatus.Open;

        public Route? Route { get; set; }
        public ICollection<Booking> Bookings { get; set; } = new List<Booking>();

        public int BookedCount => Bookings.Count(b => b.Status == BookingStatus.Confirmed || b.Status == BookingStatus.Pending);
        public bool IsFull => BookedCount >= Capacity;
    }

    public class Booking
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public Guid SlotId { get; set; }
        public BookingStatus Status { get; set; } = BookingStatus.Pending;
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? CancelledAt { get; set; }
        public int? FeedbackRating { get; set; }
        public string? FeedbackComment { get; set; }

        public User? User { get; set; }
        public TimeSlot? Slot { get; set; }
        public TourSession? Session { get; set; }
    }

    public class TourSession
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid BookingId { get; set; }
        public SessionStatus Status { get; set; } = SessionStatus.Scheduled;
        public Guid? AssignedAMRId { get; set; }
        public DateTime? StartedAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        public Booking? Booking { get; set; }
        public AMRUnit? AssignedAMR { get; set; }
        public ICollection<Mission> Missions { get; set; } = new List<Mission>();
        public ICollection<AMRAssignment> Assignments { get; set; } = new List<AMRAssignment>();
        public ICollection<OperationalAlert> Alerts { get; set; } = new List<OperationalAlert>();
        public ICollection<TourTimelineEvent> TimelineEvents { get; set; } = new List<TourTimelineEvent>();
    }

    public enum AMRStatus { Idle, Charging, OnMission, Offline, Error }

    public class AMRUnit
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = string.Empty;
        public AMRStatus Status { get; set; } = AMRStatus.Offline;
        public double BatteryPercent { get; set; }
        public double? LastLat { get; set; }
        public double? LastLng { get; set; }
        public DateTime? LastSeenAt { get; set; }
    }
}
