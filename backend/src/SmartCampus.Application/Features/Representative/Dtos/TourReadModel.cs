namespace SmartCampus.Application.Features.Representative.Dtos;

public sealed record TourReadModel(Guid Id, string Name, string? Description,
    DateTimeOffset ScheduledStartAt, string State, byte[] RowVersion, string RouteName,
    IReadOnlyList<TourStopResponse> Stops);
