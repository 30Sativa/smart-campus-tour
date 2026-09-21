using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class Tour
{
    public Guid Id { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public Guid RouteId { get; set; }

    public DateTimeOffset ScheduledStartAt { get; set; }

    public string State { get; set; } = null!;

    public Guid? AssignedRobotId { get; set; }

    public string? OperationalStatus { get; set; }

    public string? AssistanceReason { get; set; }

    public string? CurrentStep { get; set; }

    public Guid? CurrentLegId { get; set; }

    public string? CurrentLegKind { get; set; }

    public int? CurrentStopOrder { get; set; }

    public int? LastArrivedStopOrder { get; set; }

    public Guid? CurrentStopVisitId { get; set; }

    public DateTimeOffset? StopVisitClosedAt { get; set; }

    public Guid? CurrentHeadCommandId { get; set; }

    public bool IsHeld { get; set; }

    public DateTimeOffset? DwellDeadlineAt { get; set; }

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? EndedAt { get; set; }

    public string? EndReason { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual Robot? AssignedRobot { get; set; }

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual ICollection<GroupRegistration> GroupRegistrations { get; set; } = new List<GroupRegistration>();

    public virtual ICollection<Robot> Robots { get; set; } = new List<Robot>();

    public virtual Route Route { get; set; } = null!;

    public virtual ICollection<TourEvent> TourEvents { get; set; } = new List<TourEvent>();
}
