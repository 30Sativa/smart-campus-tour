using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.StartTour;

public sealed record StartTourRequest(Guid RequestId, string ExpectedRowVersion, TourStartConfirmation? Confirmation);
public sealed record StartTourCommand(Guid Id, Guid Actor, StartTourRequest Request) : ITourMutationCommand<TourMutationResult>;
