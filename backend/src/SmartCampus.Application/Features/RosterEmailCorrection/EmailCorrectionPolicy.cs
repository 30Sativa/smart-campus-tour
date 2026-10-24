using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RosterEmailCorrection;

public static class EmailCorrectionPolicy
{
    public static RegistrationGate Evaluate(string tourState, string registrationState, bool hasInvitations, bool invitationsEnabled)
    {
        if (!RegistrationGate.IsTourOpen(tourState))
            return RegistrationGate.Refuse(RegistrationGate.TourLockedCode,
                tourState == "READY" ? "Tour đã READY. Mở lại về SCHEDULED trước khi sửa email." : "Chỉ sửa email khi Tour SCHEDULED.");
        if (registrationState is not (RegistrationStates.Submitted or RegistrationStates.Rejected or RegistrationStates.Approved))
            return RegistrationGate.Refuse(RegistrationGate.StateConflictCode, "Đăng ký đã hủy hoặc trạng thái không cho phép sửa email.");
        if (registrationState == RegistrationStates.Approved)
            return invitationsEnabled ? RegistrationGate.Open : RegistrationGate.Refuse("INVITATIONS_DISABLED",
                "Cần bật hỗ trợ lời mời để thu hồi và gửi mã mới cho dòng đã duyệt.");
        return hasInvitations ? RegistrationGate.Refuse(RegistrationGate.InvitationBoundaryCode,
            "Đăng ký chưa duyệt có lịch sử lời mời; cần xử lý quyền truy cập trước khi sửa.") : RegistrationGate.Open;
    }
}
