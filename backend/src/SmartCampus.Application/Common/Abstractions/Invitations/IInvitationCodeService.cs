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
}
