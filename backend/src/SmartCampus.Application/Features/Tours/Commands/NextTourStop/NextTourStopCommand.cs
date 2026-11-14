using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.NextTourStop;

/// <summary><paramref name="Confirmation"/> is required only to depart from the start of a Tour opened with HoldAtStart.</summary>
public sealed record NextTourStopRequest(Guid RequestId, string ExpectedRowVersion, TourStartConfirmation? Confirmation = null);
public sealed record NextTourStopCommand(Guid Id, Guid Actor, NextTourStopRequest Request) : ITourMutationCommand<TourMutationResult>;
