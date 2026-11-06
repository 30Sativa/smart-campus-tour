using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class TourScheduleBlock
{
    public Guid Id { get; set; }

    public DateOnly BlockDate { get; set; }

    public string? ShiftCode { get; set; }

    public string Reason { get; set; } = null!;

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid? RemovedByUserId { get; set; }

    public DateTimeOffset? RemovedAt { get; set; }

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual User? RemovedByUser { get; set; }
}
