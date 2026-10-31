using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class RouteTestRun
{
    public Guid Id { get; set; }

    public Guid RouteRevisionId { get; set; }

    public byte[] NavigationFingerprint { get; set; } = null!;

    public Guid MapVersionId { get; set; }

    public Guid MapDeploymentCheckId { get; set; }

    public byte[] MapPackageSha256 { get; set; } = null!;

    public Guid RobotId { get; set; }

    public Guid CheckedByUserId { get; set; }

    public Guid ParticipatingStaffUserId { get; set; }

    public string ResultCode { get; set; } = null!;

    public bool AllStopsReached { get; set; }

    public bool SafelyStopped { get; set; }

    public bool LocalizationPassed { get; set; }

    public int MeasuredDurationSeconds { get; set; }

    public string? FailureReason { get; set; }

    public string EvidenceNote { get; set; } = null!;

    public Guid RequestId { get; set; }

    public byte[] RequestHash { get; set; } = null!;

    public DateTimeOffset CheckedAt { get; set; }

    public string? MeasurementBasis { get; set; }

    public virtual User CheckedByUser { get; set; } = null!;

    public virtual MapDeploymentCheck MapDeploymentCheck { get; set; } = null!;

    public virtual User ParticipatingStaffUser { get; set; } = null!;

    public virtual Robot Robot { get; set; } = null!;

    public virtual ICollection<TourRobotReservation> TourRobotReservations { get; set; } = new List<TourRobotReservation>();

    public virtual RouteRevision RouteRevision { get; set; } = null!;
}
