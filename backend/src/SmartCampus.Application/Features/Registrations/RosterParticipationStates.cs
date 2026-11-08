namespace SmartCampus.Application.Features.Registrations;

public static class RosterParticipationStates
{
    public const string Pending = "PENDING";
    public const string Accepted = "ACCEPTED";
    public const string Rejected = "REJECTED";
    public const string Removed = "REMOVED";
    /// <summary>Not decided by T-24h (BR-05): gives its seat back. The same word closes an email-change request.</summary>
    public const string Expired = "EXPIRED";

    /// <summary>The states that hold a seat of the Tour (BR-26).</summary>
    public static bool HoldsSeat(string state) => state is Pending or Accepted;
}
