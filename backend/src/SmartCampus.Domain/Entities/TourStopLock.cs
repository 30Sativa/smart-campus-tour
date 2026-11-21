using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class TourStopLock
{
    public Guid Id { get; set; }

    public Guid TourId { get; set; }

    public Guid RouteRevisionStopId { get; set; }

    public string Reason { get; set; } = null!;

    public Guid LockedByUserId { get; set; }

    public DateTimeOffset LockedAt { get; set; }

    public Guid? UnlockedByUserId { get; set; }

    public DateTimeOffset? UnlockedAt { get; set; }

    public string? UnlockReason { get; set; }

    public virtual User LockedByUser { get; set; } = null!;

    public virtual RouteRevisionStop RouteRevisionStop { get; set; } = null!;

    public virtual Tour Tour { get; set; } = null!;

    public virtual User? UnlockedByUser { get; set; }
}
