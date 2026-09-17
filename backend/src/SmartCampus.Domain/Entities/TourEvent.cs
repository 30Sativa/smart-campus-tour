using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class TourEvent
{
    public long Id { get; set; }

    public Guid TourId { get; set; }

    public string EventType { get; set; } = null!;

    public DateTimeOffset OccurredAt { get; set; }

    public Guid? RobotId { get; set; }

    public Guid? LegId { get; set; }

    public string? LegKind { get; set; }

    public Guid? TargetPoiId { get; set; }

    public int? TargetStopOrder { get; set; }

    public decimal? TargetX { get; set; }

    public decimal? TargetY { get; set; }

    public decimal? TargetYaw { get; set; }

    public Guid? ActorUserId { get; set; }

    public string? ReasonCode { get; set; }

    public string? ReasonNote { get; set; }

    public bool? NarrationInterrupted { get; set; }

    public string? DataJson { get; set; }

    public virtual User? ActorUser { get; set; }

    public virtual Robot? Robot { get; set; }

    public virtual Poi? TargetPoi { get; set; }

    public virtual Tour Tour { get; set; } = null!;
}
