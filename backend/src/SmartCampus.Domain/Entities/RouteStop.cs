using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class RouteStop
{
    public Guid Id { get; set; }

    public Guid RouteId { get; set; }

    public Guid PoiId { get; set; }

    public int StopOrder { get; set; }

    public int DwellSeconds { get; set; }

    public string HeadStepsJson { get; set; } = null!;

    public virtual ICollection<BranchRequest> BranchRequests { get; set; } = new List<BranchRequest>();

    public virtual Poi Poi { get; set; } = null!;

    public virtual Route Route { get; set; } = null!;

    public virtual ICollection<RouteVariant> RouteVariantBranchPointRouteStops { get; set; } = new List<RouteVariant>();

    public virtual ICollection<RouteVariant> RouteVariantVariantBranchStops { get; set; } = new List<RouteVariant>();

    public virtual ICollection<Tour> TourCurrentRouteStops { get; set; } = new List<Tour>();

    public virtual ICollection<Tour> TourLastArrivedRouteStops { get; set; } = new List<Tour>();
}
