using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class PoiProposalRevision
{
    public Guid Id { get; set; }

    public Guid ProposalId { get; set; }

    public int RevisionNumber { get; set; }

    public Guid MapVersionId { get; set; }

    public string Name { get; set; } = null!;

    public string Purpose { get; set; } = null!;

    public string? Description { get; set; }

    public decimal X { get; set; }

    public decimal Y { get; set; }

    public decimal Yaw { get; set; }

    public string CameraPreset { get; set; } = null!;

    public byte[] NavigationFingerprint { get; set; } = null!;

    public Guid RequestId { get; set; }

    public byte[] RequestHash { get; set; } = null!;

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual MapVersion MapVersion { get; set; } = null!;

    public virtual PoiProposalSubmission? PoiProposalSubmission { get; set; }

    public virtual PoiVerificationRecord? PoiVerificationRecord { get; set; }

    public virtual PoiProposal Proposal { get; set; } = null!;

    public virtual ICollection<RouteRevisionStop> RouteRevisionStops { get; set; } = new List<RouteRevisionStop>();
}
