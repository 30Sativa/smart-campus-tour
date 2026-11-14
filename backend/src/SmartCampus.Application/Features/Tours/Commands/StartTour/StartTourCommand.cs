using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.StartTour;

/// <summary>
/// <paramref name="HoldAtStart"/> opens the Tour without its first leg: the robot waits at the start until the Operator
/// departs with Next, which then asks for the on-site confirmations. False keeps the original Start, which departs at once.
/// </summary>
public sealed record StartTourRequest(Guid RequestId, string ExpectedRowVersion, TourStartConfirmation? Confirmation,
    bool HoldAtStart = false);
public sealed record StartTourCommand(Guid Id, Guid Actor, StartTourRequest Request) : ITourMutationCommand<TourMutationResult>;
