namespace SmartCampus.Application.Features.Registrations;

/// <summary>GroupRegistrations.State values: SQL uppercase strings described by the schema, not a CHECK constraint.</summary>
public static class RegistrationStates
{
    public const string Submitted = "SUBMITTED";
    public const string Approved = "APPROVED";
    public const string Rejected = "REJECTED";
    public const string Cancelled = "CANCELLED";

    public static bool IsKnown(string? state) => state is Submitted or Approved or Rejected or Cancelled;
}
