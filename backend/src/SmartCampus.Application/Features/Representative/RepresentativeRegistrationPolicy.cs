using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.Representative;

/// <summary>
/// What a Representative may do with an owned registration. Commands enforce the decision under the Tour
/// lock; queries project the same decision as client-facing action gates.
/// </summary>
public static class RepresentativeRegistrationPolicy
{
    public const string ApprovedBoundary = "Đăng ký đã được duyệt. Chức năng sửa/hủy sau duyệt chưa được triển khai.";
    public const string InvitationBoundary = "Đăng ký đã có lời mời. Chức năng sửa/hủy sau duyệt chưa được triển khai.";

    public static RegistrationGate Evaluate(string tourState, string registrationState, bool hasInvitations,
        RegistrationOperation operation)
    {
        if (!RegistrationGate.IsTourOpen(tourState))
            return RegistrationGate.TourLocked;
        if (operation == RegistrationOperation.Create)
            return RegistrationGate.Open;
        if (registrationState == RegistrationStates.Approved)
            return RegistrationGate.Refuse(RegistrationGate.InvitationBoundaryCode, ApprovedBoundary);
        if (hasInvitations)
            return RegistrationGate.Refuse(RegistrationGate.InvitationBoundaryCode, InvitationBoundary);
        var allowed = operation switch
        {
            RegistrationOperation.Update => registrationState == RegistrationStates.Submitted,
            RegistrationOperation.Resubmit => registrationState is RegistrationStates.Rejected or RegistrationStates.Cancelled,
            RegistrationOperation.Cancel => registrationState is RegistrationStates.Submitted or RegistrationStates.Rejected,
            _ => false
        };
        return allowed
            ? RegistrationGate.Open
            : RegistrationGate.Refuse(RegistrationGate.StateConflictCode, "Trạng thái đăng ký không cho phép thao tác này.");
    }
}
