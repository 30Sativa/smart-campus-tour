using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.ReopenTour;

public sealed record ReopenTourRequest(Guid RequestId, string ExpectedRowVersion, string Reason);
public sealed record ReopenTourCommand(Guid Id, Guid Actor, ReopenTourRequest Request) : ITourMutationCommand<TourMutationResult>;
