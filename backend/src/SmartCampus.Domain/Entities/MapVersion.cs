using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class MapVersion
{
    public Guid Id { get; set; }

    public string AreaKey { get; set; } = null!;

    public int VersionNumber { get; set; }

    public string MapKey { get; set; } = null!;

    public string PackageFileName { get; set; } = null!;

    public byte[] PackageSha256 { get; set; } = null!;

    public byte[] RequestHash { get; set; } = null!;

    public byte[] PackageBytes { get; set; } = null!;

    public string ImageFileName { get; set; } = null!;

    public int ImageWidth { get; set; }

    public int ImageHeight { get; set; }

    public decimal Resolution { get; set; }

    public decimal OriginX { get; set; }

    public decimal OriginY { get; set; }

    public decimal OriginYaw { get; set; }

    public bool Negate { get; set; }

    public decimal OccupiedThreshold { get; set; }

    public decimal FreeThreshold { get; set; }

    public string FrameId { get; set; } = null!;

    public string ValidationStatus { get; set; } = null!;

    public Guid UploadedByUserId { get; set; }

    public Guid UploadRequestId { get; set; }

    public DateTimeOffset UploadedAt { get; set; }

    public virtual MapArea AreaKeyNavigation { get; set; } = null!;

    public virtual ICollection<MapDeploymentCheck> MapDeploymentChecks { get; set; } = new List<MapDeploymentCheck>();

    public virtual ICollection<Robot> AssignedRobots { get; set; } = new List<Robot>();

    public virtual ICollection<PoiProposalRevision> PoiProposalRevisions { get; set; } = new List<PoiProposalRevision>();

    public virtual ICollection<PoiVerificationRecord> PoiVerificationRecords { get; set; } = new List<PoiVerificationRecord>();

    public virtual ICollection<RouteRevision> RouteRevisionMapVersionNavigations { get; set; } = new List<RouteRevision>();

    public virtual ICollection<RouteRevision> RouteRevisionMapVersions { get; set; } = new List<RouteRevision>();

    public virtual User UploadedByUser { get; set; } = null!;
}
