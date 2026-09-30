using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class TourAllowedBranch
{
    public Guid Id { get; set; }

    public Guid TourId { get; set; }

    public Guid RouteVariantId { get; set; }

    public bool IsEnabled { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual ICollection<BranchRequest> BranchRequests { get; set; } = new List<BranchRequest>();

    public virtual RouteVariant RouteVariant { get; set; } = null!;

    public virtual Tour Tour { get; set; } = null!;
}
