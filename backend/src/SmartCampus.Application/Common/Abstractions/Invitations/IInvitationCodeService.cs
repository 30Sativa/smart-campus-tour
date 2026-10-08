namespace SmartCampus.Application.Common.Abstractions.Invitations;

public sealed record InvitationCode(byte[] Hash, byte[] Protected);
public interface IInvitationCodeService
{
    InvitationCode Create(Guid invitationId, int version);
    string Reveal(Guid invitationId, int version, byte[] protectedCode);
    byte[] Hash(string code);
}
public sealed record InvitationSettings(bool Enabled, int ExpiryHoursAfterStart, int SessionIdleMinutes = 10);
public sealed record InvitationEmail(Guid TourId, Guid InvitationId, Guid AttemptId, string Recipient, string TourName,
    DateTimeOffset ScheduledStartAt, DateTimeOffset ExpiresAt, int AccessVersion, byte[] ProtectedCode);
public sealed record EmailSendResult(string Status, string Code);
public interface IInvitationEmailSender
{
    Task<EmailSendResult> SendAsync(InvitationEmail email, CancellationToken ct);
}
