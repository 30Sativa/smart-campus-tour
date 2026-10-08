using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration.Dtos;

namespace SmartCampus.Application.Features.Representative.Commands;

public static class RepresentativeRegistrationPolicy
{
    public const string ApprovedBoundary = "Đăng ký đã được duyệt. Chức năng sửa/hủy sau duyệt chưa được triển khai.";
    public const string InvitationBoundary = "Đăng ký đã có lời mời. Chức năng sửa/hủy sau duyệt chưa được triển khai.";
    public const string TourLockedCode = "TOUR_LOCKED";
    public const string StateConflictCode = "STATE_CONFLICT";
    public const string InvitationBoundaryCode = "INVITATION_BOUNDARY";

    public static RegistrationActions Actions(string tourState, string registrationState, bool hasInvitations) =>
        new(Gate(tourState, registrationState, hasInvitations, RegistrationOperation.Update),
            Gate(tourState, registrationState, hasInvitations, RegistrationOperation.Resubmit),
            Gate(tourState, registrationState, hasInvitations, RegistrationOperation.Cancel));

    private static GateDecision Evaluate(string tourState, string registrationState, bool hasInvitations,
        RegistrationOperation operation)
    {
        if (tourState != RegistrationConsistency.Scheduled)
            return new(false, "Tour đã khóa đăng ký.", TourLockedCode);
        if (operation == RegistrationOperation.Create)
            return new(true);
        if (registrationState == RegistrationConsistency.Approved)
            return new(false, ApprovedBoundary, InvitationBoundaryCode);
        if (hasInvitations)
            return new(false, InvitationBoundary, InvitationBoundaryCode);
        var allowed = operation switch
        {
            RegistrationOperation.Update => registrationState == RegistrationConsistency.Submitted,
            RegistrationOperation.Resubmit => registrationState is RegistrationConsistency.Rejected or RegistrationConsistency.Cancelled,
            RegistrationOperation.Cancel => registrationState is RegistrationConsistency.Submitted or RegistrationConsistency.Rejected,
            _ => false
        };
        return allowed
            ? new(true)
            : new(false, "Trạng thái đăng ký không cho phép thao tác này.", StateConflictCode);
    }

    public static ActionGate Gate(string tourState, string registrationState, bool hasInvitations,
        RegistrationOperation operation)
    {
        var decision = Evaluate(tourState, registrationState, hasInvitations, operation);
        return new(decision.Allowed, decision.Reason);
    }

    public static void RequireAllowed(string tourState, string registrationState, bool hasInvitations,
        RegistrationOperation operation)
    {
        var decision = Evaluate(tourState, registrationState, hasInvitations, operation);
        if (decision.Allowed) return;
        throw new ConflictException(decision.Reason ?? "Trạng thái đăng ký không cho phép thao tác này.",
            decision.Code ?? StateConflictCode);
    }

    private sealed record GateDecision(bool Allowed, string? Reason = null, string? Code = null);
}
