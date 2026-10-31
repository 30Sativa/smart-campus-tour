using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class RouteRevisionStop
{
    public Guid Id { get; set; }

    public Guid RouteRevisionId { get; set; }

    public Guid PoiProposalRevisionId { get; set; }

    public Guid SourcePoiVerificationRecordId { get; set; }

    public Guid MapVersionId { get; set; }

    public byte[] PoiNavigationFingerprint { get; set; } = null!;

    public int StopOrder { get; set; }

    public int DwellSeconds { get; set; }

    public string HeadStepsJson { get; set; } = null!;

    public string Name { get; set; } = null!;

    public decimal X { get; set; }

    public decimal Y { get; set; }

    public decimal Yaw { get; set; }

    public string CameraPreset { get; set; } = null!;

    public string? NarrationText { get; set; }

    public string? FallbackVideoUrl { get; set; }

    public virtual PoiProposalRevision PoiProposalRevision { get; set; } = null!;

    public virtual PoiVerificationRecord PoiVerificationRecord { get; set; } = null!;

    public virtual RouteRevision RouteRevision { get; set; } = null!;
}
