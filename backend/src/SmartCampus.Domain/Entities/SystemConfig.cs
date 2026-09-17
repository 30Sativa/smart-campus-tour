using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class SystemConfig
{
    public byte Id { get; set; }

    public decimal MeetingPointX { get; set; }

    public decimal MeetingPointY { get; set; }

    public decimal MeetingPointYaw { get; set; }

    public int DefaultQaSeconds { get; set; }

    public int BookingCutoffMinutes { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
