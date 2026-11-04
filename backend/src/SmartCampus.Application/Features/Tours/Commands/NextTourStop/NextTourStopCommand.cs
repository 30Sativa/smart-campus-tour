using SmartCampus.Application.Common.Abstractions.Messaging;

namespace SmartCampus.Application.Features.Tours.Commands.NextTourStop;

public sealed record NextTourStopRequest(Guid RequestId, string ExpectedRowVersion);
public sealed record NextTourStopCommand(Guid Id, Guid Actor, NextTourStopRequest Request) : ITourMutationCommand<TourMutationResult>;
