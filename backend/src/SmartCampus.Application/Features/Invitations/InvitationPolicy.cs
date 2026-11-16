using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Invitations;

public static class InvitationPolicy
{
    public static bool CanSend(Tour tour, GroupRegistration registration, Invitation invitation, DateTimeOffset now) =>
        invitation.RosterRow.ParticipationState == RosterParticipationStates.Accepted &&
        invitation.RosterRow.IsActive && invitation.ExpiresAt > now &&
        invitation.RevokedAt is null && tour.State is "SCHEDULED" or "READY" or "RUNNING";

    public static bool CanRevoke(Tour tour, GroupRegistration registration, Invitation invitation, DateTimeOffset now) =>
        invitation.RosterRow.ParticipationState == RosterParticipationStates.Accepted &&
        invitation.RosterRow.IsActive && invitation.ExpiresAt > now &&
        invitation.RevokedAt is null && (tour.State is "SCHEDULED" or "READY" or "RUNNING" ||
        tour.State == "CANCELLED" && tour.StartedAt is not null);

    /// <summary>
    /// Whether a viewer may enter or keep watching: the invitation is still sendable, or a started Tour was
    /// cancelled (fallback video) and the invitation is still revocable. Shared by AccessTour and viewer presence.
    /// </summary>
    public static bool CanEnter(Tour tour, GroupRegistration registration, Invitation invitation, DateTimeOffset now) =>
        CanSend(tour, registration, invitation, now) ||
        tour.State == "CANCELLED" && tour.StartedAt is not null && CanRevoke(tour, registration, invitation, now);

    public static bool CanReissue(Tour tour, GroupRegistration registration, Invitation invitation, DateTimeOffset now) =>
        invitation.RosterRow.ParticipationState == RosterParticipationStates.Accepted &&
        invitation.RosterRow.IsActive && invitation.ExpiresAt > now &&
        tour.State is "SCHEDULED" or "READY" or "RUNNING";

    public static void Require(bool allowed) {
        if (!allowed) throw new ConflictException("Lời mời không còn cho phép thao tác này. Tải lại để kiểm tra.", "INVITATION_UNAVAILABLE");
    }
}
public sealed record InvitationItem(Guid Id, int RowNumber, string RowType, string DisplayName, string Email,
    string RowVersion, int AccessVersion, DateTimeOffset ExpiresAt, DateTimeOffset? RevokedAt,
    string EmailStatus, DateTimeOffset? LastEmailAt, bool CanSend, bool CanReissue, bool CanRevoke,
    string ViewerPresence, DateTimeOffset? FirstEnteredAt, DateTimeOffset? LastSeenAt, DateTimeOffset? SessionExpiresAt);
public sealed record InvitationReadModel(IReadOnlyList<Invitation> Invitations, Tour Tour,
    GroupRegistration Registration, IReadOnlyList<AuditLog> Audits,
    IReadOnlyDictionary<Guid, ViewerSessionSummary> Sessions);
/// <summary>
/// Per-invitation aggregate over every BrowserSession (closed ones included), without device/IP data.
/// The unended session is reported as stored; the caller decides whether its lease is still open.
/// </summary>
public sealed record ViewerSessionSummary(DateTimeOffset FirstEnteredAt, DateTimeOffset? LastSeenAt,
    DateTimeOffset? UnendedLastSeenAt, DateTimeOffset? UnendedExpiresAt);
public sealed record InvitationDetails(bool Enabled, bool CanIssue, IReadOnlyList<InvitationItem> Items);
public sealed record EmailWorkItem(Guid AttemptId, bool Interrupted);
public sealed record TourCancelRecipient(Guid RegistrationId, string Email);
