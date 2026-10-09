using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Registrations;

public static class RegistrationAudit
{
    public const string RegistrationEntityType = "GroupRegistration";
    public const string SubmittedAuditAction = "REGISTRATION_SUBMITTED";
    public const string UpdatedAuditAction = "REGISTRATION_UPDATED";
    public const string ResubmittedAuditAction = "REGISTRATION_RESUBMITTED";
    public const string CancelledAuditAction = "REGISTRATION_CANCELLED";
    public const string ApprovedAuditAction = "REGISTRATION_APPROVED";
    public const string RejectedAuditAction = "REGISTRATION_REJECTED";
    public static AuditLog Create(GroupRegistration registration, Guid actor, string action, DateTimeOffset now, Guid? key = null) =>
        new()
        {
            ActorUserId = actor, TourId = registration.TourId, CorrelationId = key, Action = action,
            EntityType = RegistrationEntityType, EntityId = registration.Id.ToString("D"),
            ResultCode = "SUCCESS", OccurredAt = now
        };
}
