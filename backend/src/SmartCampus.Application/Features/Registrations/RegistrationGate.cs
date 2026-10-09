using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Registrations;

/// <summary>
/// Outcome of a registration write policy: the client-facing <see cref="ActionGate"/> plus the 409 code a
/// refused write reports. Representative edits and Admin review share the Tour window and conflict codes.
/// </summary>
public sealed record RegistrationGate(bool Allowed, string? Reason = null, string? Code = null)
{
    /// <summary>Registration writes are accepted only while the parent Tour is SCHEDULED.</summary>
    public const string OpenTourState = "SCHEDULED";
    public const string TourLockedCode = "TOUR_LOCKED";
    public const string StateConflictCode = "STATE_CONFLICT";
    public const string InvitationBoundaryCode = "INVITATION_BOUNDARY";

    public static readonly RegistrationGate Open = new(true);
    public static readonly RegistrationGate TourLocked = Refuse(TourLockedCode, "Tour đã khóa đăng ký.");

    public static RegistrationGate Refuse(string code, string reason) => new(false, reason, code);

    public static bool IsTourOpen(string tourState) => tourState == OpenTourState;

    public ActionGate ToActionGate() => new(Allowed, Reason);

    public void EnsureAllowed()
    {
        if (!Allowed) throw new ConflictException(Reason!, Code!);
    }
}
