using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.MarkTourReady;

public sealed record MarkTourReadyRequest(Guid RequestId, string ExpectedRowVersion);
public sealed record MarkTourReadyCommand(Guid Id, Guid Actor, MarkTourReadyRequest Request) : ITourMutationCommand<TourMutationResult>;
