using SmartCampus.Application.Features.Registrations;
namespace SmartCampus.Application.Features.Representative.Queries.Tours;

public sealed record TourResponse(Guid Id, string Name, string? Description, DateTimeOffset ScheduledStartAt,
    string State, string RowVersion, string RouteName, IReadOnlyList<TourStopResponse> Stops, ActionGate Register,
    string? CancelReason = null, int Capacity = 0, int RemainingSeats = 0);
