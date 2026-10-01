using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class BrowserSession
{
    public Guid Id { get; set; }

    public Guid InvitationId { get; set; }

    public byte[] SessionTokenHash { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? LastSeenAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? EndedAt { get; set; }

    public string? EndReason { get; set; }

    public virtual Invitation Invitation { get; set; } = null!;
}
