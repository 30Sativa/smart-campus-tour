using SmartCampus.Application.Features.Representative.Dtos;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;

namespace SmartCampus.Application.Features.Representative;

internal static class RepresentativeResponseMapper
{
    public static TourResponse Tour(TourReadModel read) => new(read.Id, read.Name, read.Description,
        read.ScheduledStartAt, read.State, Convert.ToBase64String(read.RowVersion), read.RouteName, read.Stops,
        RegistrationRules.Gate(read.State, string.Empty, false, RegistrationOperation.Create));

    public static RegistrationDetails Registration(RegistrationReadModel read) => new(read.Summary,
        read.ContactName, read.ContactEmail, Convert.ToBase64String(read.RowVersion),
        Convert.ToBase64String(read.TourRowVersion), read.RejectionReason, read.ReviewedAt, read.Roster,
        RegistrationRules.Actions(read.Summary.TourState, read.Summary.State, read.HasInvitations));
}
