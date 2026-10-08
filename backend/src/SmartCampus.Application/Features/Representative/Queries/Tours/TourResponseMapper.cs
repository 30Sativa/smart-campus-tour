using SmartCampus.Application.Features.Representative.Commands;

namespace SmartCampus.Application.Features.Representative.Queries.Tours;

internal static class TourResponseMapper
{
    public static TourResponse Map(TourReadModel read) => new(read.Id, read.Name, read.Description,
        read.ScheduledStartAt, read.State, Convert.ToBase64String(read.RowVersion), read.RouteName, read.Stops,
        RepresentativeRegistrationPolicy.Gate(read.State, string.Empty, false, RegistrationOperation.Create));

}
