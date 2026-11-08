using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Registrations;

/// <summary>GroupRegistrations.State values: SQL uppercase strings described by the schema, not a CHECK constraint.</summary>
public static class RegistrationStates
{
    public const string Submitted = "SUBMITTED";
    public const string Approved = "APPROVED";
    public const string Rejected = "REJECTED";
    public const string Cancelled = "CANCELLED";

    public static bool IsKnown(string? state) => state is Submitted or Approved or Rejected or Cancelled;

    /// <summary>The whole-registration state its active rows imply, after a Staff row decision or the T-24h expiry.</summary>
    public static string FromRows(ICollection<RosterRow> rows) =>
        rows.Any(row => row.IsActive && row.ParticipationState == RosterParticipationStates.Accepted) ? Approved
        : rows.Any(row => row.IsActive && row.ParticipationState == RosterParticipationStates.Pending) ? Submitted
        : Rejected;
}
