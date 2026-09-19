using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class GroupRegistration
{
    public Guid Id { get; set; }

    public Guid TourId { get; set; }

    public Guid RepresentativeUserId { get; set; }

    public string SchoolName { get; set; } = null!;

    public string ContactName { get; set; } = null!;

    public string ContactEmail { get; set; } = null!;

    public string State { get; set; } = null!;

    public Guid? ReviewedByUserId { get; set; }

    public DateTimeOffset? ReviewedAt { get; set; }

    public string? RejectionReason { get; set; }

    public byte[] GroupCodeHash { get; set; } = null!;

    public byte[] GroupCodeProtected { get; set; } = null!;

    public DateTimeOffset? InvitationSentAt { get; set; }

    public int AccessVersion { get; set; }

    public DateTimeOffset SubmittedAt { get; set; }

    public DateTimeOffset? CancelledAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual User RepresentativeUser { get; set; } = null!;

    public virtual User? ReviewedByUser { get; set; }

    public virtual ICollection<RosterRow> RosterRows { get; set; } = new List<RosterRow>();

    public virtual Tour Tour { get; set; } = null!;
}
