using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class Poi
{
    public Guid Id { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public string MapKey { get; set; } = null!;

    public string MapFrame { get; set; } = null!;

    public decimal X { get; set; }

    public decimal Y { get; set; }

    public decimal Yaw { get; set; }

    public string? NarrationText { get; set; }

    public string? AudioUrl { get; set; }

    public int? NarrationSeconds { get; set; }

    public bool IsActive { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual ICollection<RouteStop> RouteStops { get; set; } = new List<RouteStop>();

    public virtual ICollection<TourEvent> TourEvents { get; set; } = new List<TourEvent>();
}
