using System;
using System.Collections.Generic;

namespace SmartCampus.Domain.Entities;

public partial class TourStopVisit
{
    public Guid Id { get; set; }

    public Guid TourId { get; set; }

    public Guid RouteRevisionStopId { get; set; }

    public string Outcome { get; set; } = null!;

    public DateTimeOffset OccurredAt { get; set; }

    public DateTimeOffset? BallotClosesAt { get; set; }

    public DateTimeOffset? BallotClosedAt { get; set; }

    public Guid? ChosenRevisionStopId { get; set; }

    public string? ChosenReason { get; set; }

    public int? ChosenVoteCount { get; set; }

    public virtual RouteRevisionStop? ChosenRevisionStop { get; set; }

    public virtual RouteRevisionStop RouteRevisionStop { get; set; } = null!;

    public virtual Tour Tour { get; set; } = null!;

    public virtual ICollection<TourStopVote> TourStopVotes { get; set; } = new List<TourStopVote>();
}
