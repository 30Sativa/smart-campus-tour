using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class TourOperatorPresence
{
    public Guid TourId { get; set; }

    public DateTimeOffset? LastSeenAt { get; set; }

    public virtual Tour Tour { get; set; } = null!;
}
