using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class TourStopVote
{
    public Guid Id { get; set; }

    public Guid TourId { get; set; }

    public Guid StopVisitId { get; set; }

    public Guid RosterRowId { get; set; }

    public Guid? RouteRevisionStopId { get; set; }

    public DateTimeOffset VotedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual RosterRow RosterRow { get; set; } = null!;

    public virtual RouteRevisionStop? RouteRevisionStop { get; set; }

    public virtual TourStopVisit StopVisit { get; set; } = null!;

    public virtual Tour Tour { get; set; } = null!;
}
