using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class PoiImportReceipt
{
    public Guid Id { get; set; }

    public Guid RequestId { get; set; }

    public byte[] RequestHash { get; set; } = null!;

    public Guid ImportedByUserId { get; set; }

    public Guid MapVersionId { get; set; }

    public Guid RobotId { get; set; }

    public string FileName { get; set; } = null!;

    public byte[] FileSha256 { get; set; } = null!;

    public string SourcePoiId { get; set; } = null!;

    public string Action { get; set; } = null!;

    public bool Verified { get; set; }

    public Guid ProposalId { get; set; }

    public Guid ProposalRevisionId { get; set; }

    public DateTimeOffset ImportedAt { get; set; }

    public virtual User ImportedByUser { get; set; } = null!;

    public virtual MapVersion MapVersion { get; set; } = null!;

    public virtual PoiProposal Proposal { get; set; } = null!;

    public virtual PoiProposalRevision ProposalRevision { get; set; } = null!;

    public virtual Robot Robot { get; set; } = null!;
}
