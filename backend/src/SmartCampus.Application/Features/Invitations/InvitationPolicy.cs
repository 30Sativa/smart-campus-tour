using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Invitations;

public static class InvitationPolicy
{
    public static bool CanSend(Tour tour, GroupRegistration registration, Invitation invitation, DateTimeOffset now) =>
        registration.State == "APPROVED" && invitation.RosterRow.IsActive && invitation.ExpiresAt > now &&
        invitation.RevokedAt is null && tour.State is "SCHEDULED" or "READY" or "RUNNING";

    public static bool CanRevoke(Tour tour, GroupRegistration registration, Invitation invitation, DateTimeOffset now) =>
        registration.State == "APPROVED" && invitation.RosterRow.IsActive && invitation.ExpiresAt > now &&
        invitation.RevokedAt is null && (tour.State is "SCHEDULED" or "READY" or "RUNNING" ||
        tour.State == "CANCELLED" && tour.StartedAt is not null);

    public static bool CanReissue(Tour tour, GroupRegistration registration, Invitation invitation, DateTimeOffset now) =>
        registration.State == "APPROVED" && invitation.RosterRow.IsActive && invitation.ExpiresAt > now &&
        tour.State is "SCHEDULED" or "READY" or "RUNNING";

    public static void Require(bool allowed) {
        if (!allowed) throw new ConflictException("Lời mời không còn cho phép thao tác này. Tải lại để kiểm tra.", "INVITATION_UNAVAILABLE");
    }
}
public sealed record InvitationItem(Guid Id, int RowNumber, string RowType, string DisplayName, string Email,
    string RowVersion, int AccessVersion, DateTimeOffset ExpiresAt, DateTimeOffset? RevokedAt,
    string EmailStatus, DateTimeOffset? LastEmailAt, bool CanSend, bool CanReissue, bool CanRevoke);
public sealed record InvitationReadModel(IReadOnlyList<Invitation> Invitations, Tour Tour,
    GroupRegistration Registration, IReadOnlyList<AuditLog> Audits);
public sealed record InvitationDetails(bool Enabled, bool CanIssue, IReadOnlyList<InvitationItem> Items);
public sealed record EmailWorkItem(Guid AttemptId, bool Interrupted);
