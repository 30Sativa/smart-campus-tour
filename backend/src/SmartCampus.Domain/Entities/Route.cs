namespace SmartCampus.Domain.Entities
{
    public enum RouteStatus { Draft, Published, Archived }

    public class Route
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string? ThumbnailUrl { get; set; }
        public int EstimatedMinutes { get; set; }
        public RouteStatus Status { get; set; } = RouteStatus.Draft;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<Waypoint> Waypoints { get; set; } = new List<Waypoint>();
        public ICollection<TimeSlot> TimeSlots { get; set; } = new List<TimeSlot>();
    }

    public class Waypoint
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid RouteId { get; set; }
        public int Order { get; set; }
        public double Lat { get; set; }
        public double Lng { get; set; }
        public string Label { get; set; } = string.Empty;

        public Route? Route { get; set; }
        public POI? POI { get; set; }
    }

    public class POI
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid WaypointId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string? KnowledgeBase { get; set; }
        public string? ImageUrl { get; set; }

        public Waypoint? Waypoint { get; set; }
    }
}
