using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class Robot
{
    public Guid Id { get; set; }

    public string RobotCode { get; set; } = null!;

    public string SourceType { get; set; } = null!;

    public string? DisplayName { get; set; }

    public byte[] CredentialHash { get; set; } = null!;

    public bool IsDispatchEnabled { get; set; }

    public bool NeedsInspection { get; set; }

    public Guid? CurrentTourId { get; set; }

    public DateTimeOffset? LastAssignedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public byte[] RowVersion { get; set; } = null!;

    public virtual Tour? CurrentTour { get; set; }

    public virtual ICollection<TourEvent> TourEvents { get; set; } = new List<TourEvent>();

    public virtual ICollection<Tour> Tours { get; set; } = new List<Tour>();
}
