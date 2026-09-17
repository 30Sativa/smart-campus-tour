using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class Booking
{
    public Guid Id { get; set; }

    public Guid TourId { get; set; }

    public Guid VisitorUserId { get; set; }

    public string Status { get; set; } = null!;

    public DateTimeOffset BookedAt { get; set; }

    public DateTimeOffset? CancelledAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual Feedback? Feedback { get; set; }

    public virtual Tour Tour { get; set; } = null!;

    public virtual ICollection<Tour> Tours { get; set; } = new List<Tour>();

    public virtual User VisitorUser { get; set; } = null!;
}
