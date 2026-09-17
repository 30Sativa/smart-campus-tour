using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class Tour
{
    public Guid Id { get; set; }

    public Guid RouteId { get; set; }

    public DateTimeOffset ScheduledStartAt { get; set; }

    public int MaxVisitors { get; set; }

    public string Status { get; set; } = null!;

    public Guid? CurrentRobotId { get; set; }

    public int? LastArrivedStopOrder { get; set; }

    public Guid? CurrentLegId { get; set; }

    public Guid? RepresentativeBookingId { get; set; }

    public string? NarrationLanguage { get; set; }

    public DateTimeOffset? RobotArrivedMeetingAt { get; set; }

    public DateTimeOffset? ActualStartedAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    public DateTimeOffset? CancelledAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual Booking? Booking { get; set; }

    public virtual ICollection<Booking> Bookings { get; set; } = new List<Booking>();

    public virtual Robot? CurrentRobot { get; set; }

    public virtual ICollection<Robot> Robots { get; set; } = new List<Robot>();

    public virtual Route Route { get; set; } = null!;

    public virtual ICollection<TourEvent> TourEvents { get; set; } = new List<TourEvent>();
}
