using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class AuditLog
{
    public long Id { get; set; }

    public Guid ActorUserId { get; set; }

    public string Action { get; set; } = null!;

    public string EntityType { get; set; } = null!;

    public string EntityId { get; set; } = null!;

    public string? ChangesJson { get; set; }

    public DateTimeOffset OccurredAt { get; set; }

    public virtual User ActorUser { get; set; } = null!;
}
