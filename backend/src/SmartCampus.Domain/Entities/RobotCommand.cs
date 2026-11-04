using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class RobotCommand
{
    public Guid Id { get; set; }

    public Guid RobotId { get; set; }

    public Guid TourId { get; set; }

    public Guid LegId { get; set; }

    public string LegKind { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public Guid? TargetCommandId { get; set; }

    public string State { get; set; } = null!;

    public bool IsOpen { get; set; }

    public string? Outcome { get; set; }

    public Guid? RouteRevisionStopId { get; set; }

    public string? MapKey { get; set; }

    public string? FrameId { get; set; }

    public decimal? X { get; set; }

    public decimal? Y { get; set; }

    public decimal? Yaw { get; set; }

    public DateTimeOffset IssuedAt { get; set; }

    public DateTimeOffset? AcceptBy { get; set; }

    public Guid? IssuedByUserId { get; set; }

    public DateTimeOffset? DeliveredAt { get; set; }

    public Guid? DeliveredStreamId { get; set; }

    public DateTimeOffset? AcceptedAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    public string? ReasonCode { get; set; }

    public Guid? ResolvedByUserId { get; set; }

    public DateTimeOffset? ResolvedAt { get; set; }

    public string? ResolutionNote { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual ICollection<RobotCommand> InverseTargetCommand { get; set; } = new List<RobotCommand>();

    public virtual User? IssuedByUser { get; set; }

    public virtual User? ResolvedByUser { get; set; }

    public virtual Robot Robot { get; set; } = null!;

    public virtual RouteRevisionStop? RouteRevisionStop { get; set; }

    public virtual RobotCommand? TargetCommand { get; set; }

    public virtual Tour Tour { get; set; } = null!;
}
