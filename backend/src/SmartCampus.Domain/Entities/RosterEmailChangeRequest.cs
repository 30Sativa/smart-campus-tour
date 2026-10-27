using System;

namespace SmartCampus.Domain.Entities;

public partial class RosterEmailChangeRequest
{
    public Guid Id { get; set; }

    public Guid RosterRowId { get; set; }

    public Guid RequestId { get; set; }

    public string CurrentEmail { get; set; } = null!;

    public string ProposedEmail { get; set; } = null!;

    public Guid RequestedByUserId { get; set; }

    public string State { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? ReviewedAt { get; set; }

    public Guid? ReviewedByUserId { get; set; }

    public string? ReviewReason { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual RosterRow RosterRow { get; set; } = null!;
}
