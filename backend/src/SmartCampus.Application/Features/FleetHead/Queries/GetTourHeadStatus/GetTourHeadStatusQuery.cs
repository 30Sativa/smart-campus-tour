using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.FleetHead.Queries.GetTourHeadStatus;

public sealed record GetTourHeadStatusQuery(Guid TourId) : IQuery<TourHeadStatus>;

/// <summary>
/// What the Operator console shows next to the head buttons. <see cref="RobotCode"/> is the assigned robot, or the robot a
/// READY Tour holds (for HOME before Start); null when there is neither.
/// </summary>
public sealed record TourHeadStatus(
    bool Enabled,
    string Mode,
    string? RobotCode,
    bool Connected,
    DateTimeOffset? LastPollAt,
    HeadStateReport? Head,
    DateTimeOffset? HeadReceivedAt);
