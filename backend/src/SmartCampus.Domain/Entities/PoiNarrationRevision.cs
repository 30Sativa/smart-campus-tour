using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class PoiNarrationRevision
{
    public Guid Id { get; set; }

    public Guid ProposalId { get; set; }

    public int RevisionNumber { get; set; }

    public string NarrationText { get; set; } = null!;

    public string? FallbackVideoUrl { get; set; }

    public string State { get; set; } = null!;

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid LastEditedByUserId { get; set; }

    public DateTimeOffset LastEditedAt { get; set; }

    public Guid? ApprovedByUserId { get; set; }

    public DateTimeOffset? ApprovedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual User? ApprovedByUser { get; set; }

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual User LastEditedByUser { get; set; } = null!;

    public virtual ICollection<PoiNarrationRequestReceipt> PoiNarrationRequestReceipts { get; set; } = new List<PoiNarrationRequestReceipt>();

    public virtual PoiProposal Proposal { get; set; } = null!;

    public virtual ICollection<RouteRevisionStop> RouteRevisionStops { get; set; } = new List<RouteRevisionStop>();
}
