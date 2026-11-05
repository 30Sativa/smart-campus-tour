using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.FleetHead.Queries.GetTourHeadStatus;

public sealed record GetTourHeadStatusQuery(Guid TourId) : IQuery<TourHeadStatus>;

/// <summary>What the Operator console shows next to the head buttons. <see cref="RobotCode"/> is null before Start.</summary>
public sealed record TourHeadStatus(
    bool Enabled,
    string? RobotCode,
    bool Connected,
    DateTimeOffset? LastPollAt,
    HeadStateReport? Head,
    DateTimeOffset? HeadReceivedAt);
