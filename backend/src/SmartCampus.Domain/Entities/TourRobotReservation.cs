using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class TourRobotReservation
{
    public Guid Id { get; set; }

    public Guid TourId { get; set; }

    public Guid RobotId { get; set; }

    public Guid RouteTestRunId { get; set; }

    public int MeasuredDurationSeconds { get; set; }

    public int? ExpectedDurationSeconds { get; set; }

    public DateTimeOffset StartsAt { get; set; }

    public DateTimeOffset EndsAt { get; set; }

    public Guid ReservedByUserId { get; set; }

    public DateTimeOffset ReservedAt { get; set; }

    public DateTimeOffset? ReleasedAt { get; set; }

    public Guid? ReleasedByUserId { get; set; }

    public virtual User? ReleasedByUser { get; set; }

    public virtual User ReservedByUser { get; set; } = null!;

    public virtual Robot Robot { get; set; } = null!;

    public virtual RouteTestRun RouteTestRun { get; set; } = null!;

    public virtual Tour Tour { get; set; } = null!;
}
