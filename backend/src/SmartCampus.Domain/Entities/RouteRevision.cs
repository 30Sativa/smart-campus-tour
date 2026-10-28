using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class RouteRevision
{
    public Guid Id { get; set; }

    public Guid RouteId { get; set; }

    public int RevisionNumber { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public Guid MapVersionId { get; set; }

    public byte[] MapPackageSha256 { get; set; } = null!;

    public decimal StartX { get; set; }

    public decimal StartY { get; set; }

    public decimal StartYaw { get; set; }

    public string EndMode { get; set; } = null!;

    public decimal? EndX { get; set; }

    public decimal? EndY { get; set; }

    public decimal? EndYaw { get; set; }

    public byte[] NavigationFingerprint { get; set; } = null!;

    public Guid RequestId { get; set; }

    public byte[] RequestHash { get; set; } = null!;

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual MapVersion MapVersion { get; set; } = null!;

    public virtual MapVersion MapVersionNavigation { get; set; } = null!;

    public virtual Route Route { get; set; } = null!;

    public virtual ICollection<RouteRevisionStop> RouteRevisionStops { get; set; } = new List<RouteRevisionStop>();

    public virtual RouteRevisionSubmission? RouteRevisionSubmission { get; set; }

    public virtual ICollection<RouteTestRun> RouteTestRuns { get; set; } = new List<RouteTestRun>();
}
