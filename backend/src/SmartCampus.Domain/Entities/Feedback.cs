using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class Feedback
{
    public Guid BookingId { get; set; }

    public byte Rating { get; set; }

    public string? Comment { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Booking Booking { get; set; } = null!;
}
