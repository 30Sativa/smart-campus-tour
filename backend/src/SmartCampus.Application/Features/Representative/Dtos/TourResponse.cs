namespace SmartCampus.Application.Features.Representative.Dtos;

public sealed record TourResponse(Guid Id, string Name, string? Description, DateTimeOffset ScheduledStartAt,
    string State, string RowVersion, string RouteName, IReadOnlyList<TourStopResponse> Stops, ActionGate Register);
