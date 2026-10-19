using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.UpdateTour;

public sealed record UpdateTourRequest(Guid RequestId, string ExpectedRowVersion, string? ExpectedRouteVersion, TourInput Configuration);
public sealed record UpdateTourCommand(Guid Id, Guid Actor, UpdateTourRequest Request) : ITourMutationCommand<TourMutationResult>;
