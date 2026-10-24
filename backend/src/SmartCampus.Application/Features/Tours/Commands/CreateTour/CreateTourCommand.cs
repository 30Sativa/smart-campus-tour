using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.CreateTour;

public sealed record CreateTourRequest(Guid RequestId, string ExpectedRouteVersion, TourInput Configuration);
public sealed record CreateTourCommand(Guid Actor, CreateTourRequest Request) : ITourMutationCommand<TourMutationResult>;
