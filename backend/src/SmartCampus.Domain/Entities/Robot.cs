using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class Robot
{
    public Guid Id { get; set; }

    public string RobotCode { get; set; } = null!;

    public string SourceType { get; set; } = null!;

    public string? DisplayName { get; set; }

    public byte[]? CredentialHash { get; set; }

    public DateTimeOffset? CredentialIssuedAt { get; set; }

    public Guid? CredentialIssuedByUserId { get; set; }

    public string? CredentialHint { get; set; }

    public DateTimeOffset? CredentialRevokedAt { get; set; }

    public Guid? CredentialRevokedByUserId { get; set; }

    public DateTimeOffset? FirstAcceptedSyncAt { get; set; }

    public string? FirstAcceptedMapKey { get; set; }

    public string? FirstAcceptedFrameId { get; set; }

    public Guid? AssignedMapVersionId { get; set; }

    public DateTimeOffset? MapAssignedAt { get; set; }

    public Guid? MapAssignedByUserId { get; set; }

    public bool IsDispatchEnabled { get; set; }

    public bool NeedsInspection { get; set; }

    public Guid? CurrentTourId { get; set; }

    public DateTimeOffset? LastAssignedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public virtual Tour? CurrentTour { get; set; }

    public virtual User? CredentialIssuedByUser { get; set; }

    public virtual User? CredentialRevokedByUser { get; set; }

    public virtual MapVersion? AssignedMapVersion { get; set; }

    public virtual User? MapAssignedByUser { get; set; }

    public virtual ICollection<MapDeploymentCheck> MapDeploymentChecks { get; set; } = new List<MapDeploymentCheck>();

    public virtual ICollection<PoiVerificationRecord> PoiVerificationRecords { get; set; } = new List<PoiVerificationRecord>();

    public virtual ICollection<RouteTestRun> RouteTestRuns { get; set; } = new List<RouteTestRun>();

    public virtual ICollection<TourEvent> TourEvents { get; set; } = new List<TourEvent>();

    public virtual ICollection<Tour> Tours { get; set; } = new List<Tour>();
}
