using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class PoiProposal
{
    public Guid Id { get; set; }

    public Guid CreatedByUserId { get; set; }

    public Guid CreateRequestId { get; set; }

    public byte[] CreateRequestHash { get; set; } = null!;

    public int CurrentRevision { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual ICollection<PoiProposalRevision> PoiProposalRevisions { get; set; } = new List<PoiProposalRevision>();
}
