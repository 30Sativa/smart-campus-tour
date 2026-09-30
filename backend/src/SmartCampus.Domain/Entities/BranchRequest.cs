using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class BranchRequest
{
    public Guid Id { get; set; }

    public Guid TourId { get; set; }

    public Guid BranchPointRouteStopId { get; set; }

    public Guid TourAllowedBranchId { get; set; }

    public Guid? RegistrationId { get; set; }

    public Guid RequestedByUserId { get; set; }

    public string RequestSource { get; set; } = null!;

    public string State { get; set; } = null!;

    public DateTimeOffset RequestedAt { get; set; }

    public Guid? ResolvedByUserId { get; set; }

    public DateTimeOffset? ResolvedAt { get; set; }

    public string? DecisionReason { get; set; }

    public string? ExpiredReason { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual RouteStop BranchPointRouteStop { get; set; } = null!;

    public virtual GroupRegistration? Registration { get; set; }

    public virtual User RequestedByUser { get; set; } = null!;

    public virtual User? ResolvedByUser { get; set; }

    public virtual Tour Tour { get; set; } = null!;

    public virtual TourAllowedBranch TourAllowedBranch { get; set; } = null!;
}
