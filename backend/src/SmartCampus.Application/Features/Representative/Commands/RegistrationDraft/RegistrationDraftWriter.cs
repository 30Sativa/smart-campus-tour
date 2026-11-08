using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Invitations;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Representative.Commands.RegistrationDraft;

// Applies a stable-identity roster diff. Access-bearing rows are never silently replaced.
internal static class RegistrationDraftWriter
{
    public static IReadOnlyList<Invitation> Apply(GroupRegistration registration, RegistrationInput input,
        IReadOnlyList<Invitation> invitations, DateTimeOffset now, bool resetRowsForResubmit = false)
    {
        var active = registration.RosterRows.Where(row => row.IsActive).ToDictionary(row => row.Id);
        var invitationByRow = invitations.ToDictionary(invitation => invitation.RosterRowId);
        // A roster update is a stable-identity diff: existing IDs retain their rows,
        // omitted active IDs are removals, and entries without IDs are additions.
        // Do not interpret a mixed removal/addition as replacing every existing row.
        var seen = new HashSet<Guid>();
        foreach (var item in input.Roster.Where(row => row.RowId is not null))
        {
            var rowId = item.RowId!.Value;
            if (!active.ContainsKey(rowId))
                throw new ConflictException("RowId không thuộc hồ sơ hiện tại hoặc dòng không còn hoạt động.", "ROW_NOT_OWNED");
            seen.Add(rowId);
        }

        registration.SchoolName = input.SchoolName.Trim();
        registration.GroupName = input.GroupName.Trim();
        registration.ContactName = input.ContactName.Trim();
        registration.ContactEmail = RegistrationEmail.Normalize(input.ContactEmail);
        registration.UpdatedAt = now;
        var removed = new List<Invitation>();
        foreach (var row in active.Values.Where(row => !seen.Contains(row.Id)))
        {
            row.IsActive = false;
            row.ParticipationState = RosterParticipationStates.Removed;
            row.UpdatedAt = now;
            if (invitationByRow.TryGetValue(row.Id, out var invitation))
            {
                InvitationIssuer.CloseSessions(invitation, now);
                invitation.RevokedAt = now;
                removed.Add(invitation);
            }
        }
        foreach (var row in input.Roster)
        {
            if (row.RowId is { } rowId)
            {
                var existing = active[rowId];
                var changed = existing.RowNumber != row.RowNumber || existing.RowType != row.RowType ||
                    existing.DisplayName != row.DisplayName.Trim() ||
                    RegistrationEmail.Normalize(existing.Email) != RegistrationEmail.Normalize(row.Email) ||
                    existing.ClassName != (string.IsNullOrWhiteSpace(row.ClassName) ? null : row.ClassName.Trim());
                if (existing.ParticipationState == RosterParticipationStates.Accepted &&
                    RegistrationEmail.Normalize(existing.Email) != RegistrationEmail.Normalize(row.Email))
                    throw new ConflictException("Email dòng đã được duyệt phải qua yêu cầu đổi email và Staff review.", "EMAIL_CHANGE_REQUEST_REQUIRED");
                if (existing.ParticipationState == RosterParticipationStates.Accepted && existing.RowType != row.RowType)
                    throw new ConflictException("Loại điểm xem đã duyệt không thể đổi qua thay danh sách.", "ROW_REVIEW_REQUIRED");
                existing.RowNumber = row.RowNumber;
                existing.RowType = row.RowType;
                existing.DisplayName = row.DisplayName.Trim();
                existing.Email = RegistrationEmail.Normalize(row.Email);
                existing.ClassName = string.IsNullOrWhiteSpace(row.ClassName) ? null : row.ClassName.Trim();
                // An expired row stays expired: its decision window is over (BR-05).
                if (existing.ParticipationState != RosterParticipationStates.Expired &&
                    (resetRowsForResubmit || changed && existing.ParticipationState == RosterParticipationStates.Rejected))
                {
                    existing.ParticipationState = RosterParticipationStates.Pending;
                    existing.ReviewedAt = null;
                    existing.ReviewedByUserId = null;
                    existing.ReviewReason = null;
                }
                existing.UpdatedAt = now;
                continue;
            }

            registration.RosterRows.Add(new RosterRow
            {
                Id = Guid.NewGuid(), RegistrationId = registration.Id, RowNumber = row.RowNumber,
                RowType = row.RowType, DisplayName = row.DisplayName.Trim(), Email = RegistrationEmail.Normalize(row.Email),
                ClassName = string.IsNullOrWhiteSpace(row.ClassName) ? null : row.ClassName.Trim(),
                ParticipationState = RosterParticipationStates.Pending, IsActive = true, CreatedAt = now
            });
        }
        return removed;
    }
}
