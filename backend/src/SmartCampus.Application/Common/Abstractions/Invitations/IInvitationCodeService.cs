namespace SmartCampus.Application.Common.Abstractions.Invitations;

public sealed record InvitationCode(byte[] Hash, byte[] Protected);
public interface IInvitationCodeService
{
    InvitationCode Create(Guid invitationId, int version);
    string Reveal(Guid invitationId, int version, byte[] protectedCode);
    byte[] Hash(string code);
}
public sealed record InvitationSettings(bool Enabled, int ExpiryHoursAfterStart, int SessionIdleMinutes = 10);
/// <summary>A committed delivery claim. Recipient and protected code are sensitive; never log this payload.</summary>
public sealed record InvitationEmail(Guid TourId, Guid InvitationId, Guid AttemptId, string Recipient, string TourName,
    DateTimeOffset ScheduledStartAt, DateTimeOffset ExpiresAt, int AccessVersion, byte[] ProtectedCode);
/// <summary>One recipient of a cancellation notice. Carries no code or link: the Tour no longer grants access.</summary>
public sealed record TourCancelEmail(Guid TourId, Guid AttemptId, Guid RegistrationId, string Recipient, string TourName,
    DateTimeOffset ScheduledStartAt, string Reason);
/// <summary>One registration's T-24h notice. Counts only: no row name or address beyond the recipient.</summary>
public sealed record RosterExpiredEmail(Guid TourId, Guid AttemptId, Guid RegistrationId, string Recipient, string TourName,
    DateTimeOffset ScheduledStartAt, int ExpiredRows, int ExpiredEmailChanges);
/// <summary>
/// Sanitized provider outcome: ACCEPTED is service acceptance, FAILED is confirmed rejection,
/// UNKNOWN is inconclusive delivery. Code is an adapter-owned diagnostic, never a provider body.
/// </summary>
public sealed record EmailSendResult(string Status, string Code);
/// <summary>External delivery after claim commit; SQL transaction ownership stays with the Application pipeline.</summary>
public interface IInvitationEmailSender
{
    /// <summary>
    /// Submits one attempt using AttemptId for provider idempotency. Cancellation/timeout can follow
    /// provider acceptance, so an uncertain attempt must not be automatically retransmitted.
    /// </summary>
    Task<EmailSendResult> SendAsync(InvitationEmail email, CancellationToken ct);
    /// <summary>Same delivery contract as <see cref="SendAsync"/>, for a notice that a Tour was cancelled.</summary>
    Task<EmailSendResult> SendTourCancelledAsync(TourCancelEmail email, CancellationToken ct);
    /// <summary>Same delivery contract as <see cref="SendAsync"/>, for items that expired at T-24h (BR-05).</summary>
    Task<EmailSendResult> SendRosterExpiredAsync(RosterExpiredEmail email, CancellationToken ct);
}
