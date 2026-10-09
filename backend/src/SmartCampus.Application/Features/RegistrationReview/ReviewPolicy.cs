using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RegistrationReview;

/// <summary>When an Admin may approve or reject: enforced by both decisions, projected by the detail query.</summary>
public static class ReviewPolicy
{
    public static RegistrationGate Evaluate(string tourState, string registrationState, bool hasInvitations)
    {
        if (!RegistrationGate.IsTourOpen(tourState))
            return RegistrationGate.TourLocked;
        if (registrationState != RegistrationStates.Submitted)
            return RegistrationGate.Refuse(RegistrationGate.StateConflictCode, "Chỉ đăng ký chờ duyệt mới được xét duyệt.");
        // Existing access is never changed implicitly: approval reversal needs atomic revocation, not in this slice.
        if (hasInvitations)
            return RegistrationGate.Refuse(RegistrationGate.InvitationBoundaryCode,
                "Đăng ký đã có lịch sử lời mời; cần xử lý quyền truy cập trước khi xét duyệt.");
        return RegistrationGate.Open;
    }
}
