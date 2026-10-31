using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class RouteRevisionSubmission
{
    public Guid Id { get; set; }

    public Guid RouteRevisionId { get; set; }

    public Guid RequestId { get; set; }

    public byte[] RequestHash { get; set; } = null!;

    public Guid SubmittedByUserId { get; set; }

    public DateTimeOffset SubmittedAt { get; set; }

    public virtual RouteRevision RouteRevision { get; set; } = null!;

    public virtual User SubmittedByUser { get; set; } = null!;
}
