using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class PoiProposalSubmission
{
    public Guid Id { get; set; }

    public Guid ProposalRevisionId { get; set; }

    public Guid SubmittedByUserId { get; set; }

    public Guid RequestId { get; set; }

    public byte[] RequestHash { get; set; } = null!;

    public DateTimeOffset SubmittedAt { get; set; }

    public virtual PoiProposalRevision ProposalRevision { get; set; } = null!;

    public virtual User SubmittedByUser { get; set; } = null!;
}
