using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Representative.Queries.Tours;

internal static class TourResponseMapper
{
    public static TourResponse Map(TourReadModel read, DateTimeOffset now)
    {
        var remainingSeats = Math.Max(0, read.Capacity - read.HeldSeats);
        return new(read.Id, read.Name, read.Description,
            read.ScheduledStartAt, read.State, RowVersionToken.Encode(read.RowVersion), read.RouteName, read.Stops,
            RegisterGate(read, remainingSeats, now), read.CancelReason, read.Capacity, remainingSeats,
            Features.Tours.TourSchedule.RegistrationClosesAt(read.ScheduledStartAt, read.IsShortNotice));
    }

    // Checked in the order SubmitRegistrationCommandHandler refuses: Tour state, the 48-hour close, then seats.
    private static ActionGate RegisterGate(TourReadModel read, int remainingSeats, DateTimeOffset now)
    {
        var gate = RepresentativeRegistrationPolicy.Evaluate(read.State, string.Empty, false, RegistrationOperation.Create).ToActionGate();
        if (!gate.Allowed) return gate;
        if (RegistrationCutoff.IsClosed(read.ScheduledStartAt, now, read.IsShortNotice)) return new(false, "Đã hết hạn đăng ký.");
        return remainingSeats == 0 ? new(false, "Tour đã đủ chỗ.") : gate;
    }
}
