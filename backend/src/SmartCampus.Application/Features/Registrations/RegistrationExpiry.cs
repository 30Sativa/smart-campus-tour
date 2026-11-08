namespace SmartCampus.Application.Features.Registrations;

/// <summary>The T-24h close of Staff review, as it applies to a whole registration (BR-05, ADR-0048).</summary>
public static class RegistrationExpiry
{
    public const string Reason = "Hết hạn duyệt trước giờ tham quan 24 giờ.";
    public const string AuditAction = "REGISTRATION_EXPIRED";

    public static bool IsReviewClosed(DateTimeOffset scheduledStartAt, DateTimeOffset now) =>
        now >= scheduledStartAt - Tours.TourSchedule.PendingDecisionClose;
}
