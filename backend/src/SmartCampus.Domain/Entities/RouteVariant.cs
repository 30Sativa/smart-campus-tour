using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class RouteVariant
{
    public Guid Id { get; set; }

    public Guid BaseRouteId { get; set; }

    public Guid BranchPointRouteStopId { get; set; }

    public Guid VariantRouteId { get; set; }

    public Guid VariantBranchStopId { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public bool IsActive { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual Route BaseRoute { get; set; } = null!;

    public virtual RouteStop BranchPointRouteStop { get; set; } = null!;

    public virtual ICollection<TourAllowedBranch> TourAllowedBranches { get; set; } = new List<TourAllowedBranch>();

    public virtual RouteStop VariantBranchStop { get; set; } = null!;

    public virtual Route VariantRoute { get; set; } = null!;
}
