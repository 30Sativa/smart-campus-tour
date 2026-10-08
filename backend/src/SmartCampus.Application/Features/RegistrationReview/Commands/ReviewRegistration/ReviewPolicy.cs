using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;

namespace SmartCampus.Application.Features.RegistrationReview.Commands.ReviewRegistration;

internal static class ReviewPolicy
{
    public static ActionGate Gate(string tourState, string state, bool hasInvitations) => Evaluate(tourState, state, hasInvitations).Gate;

    public static void RequireAllowed(string tourState, string state, bool hasInvitations)
    {
        var (gate, code) = Evaluate(tourState, state, hasInvitations);
        if (!gate.Allowed) throw new ConflictException(gate.Reason!, code!);
    }

    private static (ActionGate Gate, string? Code) Evaluate(string tourState, string state, bool hasInvitations)
    {
        if (tourState != RegistrationConsistency.Scheduled) return (new(false, "Tour đã khóa đăng ký."), "TOUR_LOCKED");
        if (state != RegistrationConsistency.Submitted) return (new(false, "Chỉ đăng ký chờ duyệt mới được xét duyệt."), "STATE_CONFLICT");
        if (hasInvitations) return (new(false, "Đăng ký đã có lịch sử lời mời; cần xử lý quyền truy cập trước khi xét duyệt."), "INVITATION_BOUNDARY");
        return (new(true), null);
    }
}
