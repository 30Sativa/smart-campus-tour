using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class Invitation
{
    public Guid Id { get; set; }

    public Guid RosterRowId { get; set; }

    public byte[] AccessCodeHash { get; set; } = null!;

    public byte[] AccessCodeProtected { get; set; } = null!;

    public int AccessVersion { get; set; }

    public DateTimeOffset CodeIssuedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual ICollection<BrowserSession> BrowserSessions { get; set; } = new List<BrowserSession>();

    public virtual RosterRow RosterRow { get; set; } = null!;
}
