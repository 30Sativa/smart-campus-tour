using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Invitations;

/// <summary>
/// The durable queue of the "your code was revoked" email, on AuditLogs like invitation delivery (ADR-0015): the request
/// row commits with the revocation, so a rollback or a replayed request queues nothing. Rows hold the invitation id and
/// access version only, never an address, name or email text.
/// </summary>
public static class InvitationRevokeNotice
{
    public const string Requested = "INVITATION_REVOKE_NOTICE_REQUESTED";
    public const string Started = "INVITATION_REVOKE_NOTICE_STARTED";
    public const string Result = "INVITATION_REVOKE_NOTICE_RESULT";

    /// <summary>
    /// Queues one notice for an invitation that this mutation took from usable to revoked. Call it only for an invitation
    /// that was revocable just before (<see cref="InvitationPolicy.CanRevoke"/>): an already revoked or expired code
    /// gets no second notice. Nothing is queued while invitation email is disabled.
    /// </summary>
    /// <summary>Ids of the invitations still usable now, read before a mutation revokes some of them.</summary>
    public static HashSet<Guid> Revocable(Tour tour, GroupRegistration registration, IEnumerable<Invitation> invitations, DateTimeOffset now) =>
        invitations.Where(i => InvitationPolicy.CanRevoke(tour, registration, i, now)).Select(i => i.Id).ToHashSet();

    public static void Queue(IInvitationRepository repository, InvitationSettings settings, Invitation invitation, Guid tourId,
        Guid? actor, DateTimeOffset now)
    {
        if (!settings.Enabled) return;
        repository.AddAudit(InvitationAudit.Create(tourId, actor, Requested, invitation.Id.ToString("D"), Guid.NewGuid(), now,
            "PENDING", new { accessVersion = invitation.AccessVersion }));
    }
}
