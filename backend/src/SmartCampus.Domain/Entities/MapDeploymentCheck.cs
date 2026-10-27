using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class MapDeploymentCheck
{
    public Guid Id { get; set; }

    public Guid MapVersionId { get; set; }

    public Guid RobotId { get; set; }

    public byte[] PackageSha256 { get; set; } = null!;

    public bool LocalizationPassed { get; set; }

    public bool DisplayPassed { get; set; }

    public string EvidenceNote { get; set; } = null!;

    public Guid CheckedByUserId { get; set; }

    public Guid RequestId { get; set; }

    public byte[] RequestHash { get; set; } = null!;

    public DateTimeOffset CheckedAt { get; set; }

    public virtual User CheckedByUser { get; set; } = null!;

    public virtual MapVersion MapVersion { get; set; } = null!;

    public virtual Robot Robot { get; set; } = null!;
}
