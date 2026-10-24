using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.CancelTour;

public sealed record CancelTourRequest(Guid RequestId, string ExpectedRowVersion, string Reason);
public sealed record CancelTourCommand(Guid Id, Guid Actor, CancelTourRequest Request) : ITourMutationCommand<TourMutationResult>;
