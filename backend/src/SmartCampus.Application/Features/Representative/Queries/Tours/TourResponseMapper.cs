using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Representative.Queries.Tours;

internal static class TourResponseMapper
{
    public static TourResponse Map(TourReadModel read) => new(read.Id, read.Name, read.Description,
        read.ScheduledStartAt, read.State, RowVersionToken.Encode(read.RowVersion), read.RouteName, read.Stops,
        RepresentativeRegistrationPolicy.Evaluate(read.State, string.Empty, false, RegistrationOperation.Create).ToActionGate());
}
