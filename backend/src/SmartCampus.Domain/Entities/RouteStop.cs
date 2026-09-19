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

    public virtual Poi Poi { get; set; } = null!;

    public virtual Route Route { get; set; } = null!;
}
