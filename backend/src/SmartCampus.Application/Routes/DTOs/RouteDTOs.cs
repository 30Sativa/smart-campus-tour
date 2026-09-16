namespace SmartCampus.Application.Routes.DTOs
{
    public class RouteDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string? ThumbnailUrl { get; set; }
        public int EstimatedMinutes { get; set; }
        public string Status { get; set; } = string.Empty;
        public List<WaypointDto> Waypoints { get; set; } = new();
    }

    public class WaypointDto
    {
        public Guid Id { get; set; }
        public int Order { get; set; }
        public double Lat { get; set; }
        public double Lng { get; set; }
        public string Label { get; set; } = string.Empty;
        public POIDto? POI { get; set; }
    }

    public class POIDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string? ImageUrl { get; set; }
    }

    public class TimeSlotDto
    {
        public Guid Id { get; set; }
        public Guid RouteId { get; set; }
        public string RouteName { get; set; } = string.Empty;
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public int Capacity { get; set; }
        public int Available { get; set; }
        public string Status { get; set; } = string.Empty;
    }
}
