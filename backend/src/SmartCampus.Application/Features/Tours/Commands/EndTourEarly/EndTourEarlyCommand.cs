using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.EndTourEarly;

public sealed record EndTourEarlyRequest(Guid RequestId, string ExpectedRowVersion, string Reason);
public sealed record EndTourEarlyCommand(Guid Id, Guid Actor, EndTourEarlyRequest Request) : ITourMutationCommand<TourMutationResult>;
