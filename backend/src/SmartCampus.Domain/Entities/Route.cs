using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class Route
{
    public Guid Id { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public string MapKey { get; set; } = null!;

    public string MapFrame { get; set; } = null!;

    public decimal StartX { get; set; }

    public decimal StartY { get; set; }

    public decimal StartYaw { get; set; }

    public string EndMode { get; set; } = null!;

    public decimal? EndX { get; set; }

    public decimal? EndY { get; set; }

    public decimal? EndYaw { get; set; }

    public bool IsActive { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual ICollection<RouteStop> RouteStops { get; set; } = new List<RouteStop>();

    public virtual ICollection<RouteVariant> RouteVariantBaseRoutes { get; set; } = new List<RouteVariant>();

    public virtual ICollection<RouteVariant> RouteVariantVariantRoutes { get; set; } = new List<RouteVariant>();

    public virtual ICollection<Tour> TourActiveRoutes { get; set; } = new List<Tour>();

    public virtual ICollection<TourEvent> TourEvents { get; set; } = new List<TourEvent>();

    public virtual ICollection<Tour> TourRoutes { get; set; } = new List<Tour>();
}
