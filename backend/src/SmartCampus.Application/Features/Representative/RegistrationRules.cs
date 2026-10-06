using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Representative.Dtos;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.Representative;

public static class RegistrationRules
{
    public const string Scheduled = "SCHEDULED";
    public const string Submitted = "SUBMITTED";
    public const string Approved = "APPROVED";
    public const string Rejected = "REJECTED";
    public const string Cancelled = "CANCELLED";
    public const string RegistrationEntityType = "GroupRegistration";
    public const string SubmittedAuditAction = "REGISTRATION_SUBMITTED";
    public const string UpdatedAuditAction = "REGISTRATION_UPDATED";
    public const string ResubmittedAuditAction = "REGISTRATION_RESUBMITTED";
    public const string CancelledAuditAction = "REGISTRATION_CANCELLED";
    public const string ApprovedBoundary = "Đăng ký đã được duyệt. Chức năng sửa/hủy sau duyệt chưa được triển khai.";
    public const string InvitationBoundary = "Đăng ký đã có lời mời. Chức năng sửa/hủy sau duyệt chưa được triển khai.";
    public const string EmailReserved = "Có email đã được đăng ký trong Tour này. Kiểm tra lại danh sách.";
    public const string TourLockedCode = "TOUR_LOCKED";
    public const string StateConflictCode = "STATE_CONFLICT";
    public const string InvitationBoundaryCode = "INVITATION_BOUNDARY";
    public const string EmailReservedCode = "EMAIL_RESERVED";

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    public static bool ValidEmail(string? email) => email is not null &&
        System.Text.RegularExpressions.Regex.IsMatch(email.Trim(), @"^[^\s@]+@[^\s@]+$");

    public static bool ValidVersion(string? value)
    {
        Span<byte> bytes = stackalloc byte[8];
        return value is not null && Convert.TryFromBase64String(value, bytes, out var length) && length == 8;
    }

    public static void CheckVersion(byte[] current, string expected)
    {
        if (!current.AsSpan().SequenceEqual(Convert.FromBase64String(expected)))
            throw new ConflictException("Dữ liệu đã thay đổi. Tải lại trước khi tiếp tục.", "STALE_VERSION");
    }

    public static RegistrationActions Actions(string tourState, string registrationState, bool hasInvitations) =>
        new(Gate(tourState, registrationState, hasInvitations, RegistrationOperation.Update),
            Gate(tourState, registrationState, hasInvitations, RegistrationOperation.Resubmit),
            Gate(tourState, registrationState, hasInvitations, RegistrationOperation.Cancel));

    private static GateDecision Evaluate(string tourState, string registrationState, bool hasInvitations,
        RegistrationOperation operation)
    {
        if (tourState != Scheduled)
            return new(false, "Tour đã khóa đăng ký.", TourLockedCode);
        if (operation == RegistrationOperation.Create)
            return new(true);
        if (registrationState == Approved)
            return new(false, ApprovedBoundary, InvitationBoundaryCode);
        if (hasInvitations)
            return new(false, InvitationBoundary, InvitationBoundaryCode);
        var allowed = operation switch
        {
            RegistrationOperation.Update => registrationState == Submitted,
            RegistrationOperation.Resubmit => registrationState is Rejected or Cancelled,
            RegistrationOperation.Cancel => registrationState is Submitted or Rejected,
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

    public static IReadOnlyDictionary<string, string[]> EmailErrors(IReadOnlyList<int> indexes) =>
        indexes.ToDictionary(index => $"Roster[{index}].Email",
            _ => new[] { "Email đã được đăng ký trong Tour này." });

    public static void Replace(GroupRegistration registration, RegistrationInput input, DateTimeOffset now)
    {
        registration.SchoolName = input.SchoolName.Trim();
        registration.GroupName = input.GroupName.Trim();
        registration.ContactName = input.ContactName.Trim();
        registration.ContactEmail = NormalizeEmail(input.ContactEmail);
        registration.UpdatedAt = now;
        foreach (var row in registration.RosterRows.Where(row => row.IsActive))
        {
            row.IsActive = false;
            row.UpdatedAt = now;
        }
        foreach (var row in input.Roster)
            registration.RosterRows.Add(new RosterRow
            {
                Id = Guid.NewGuid(), RegistrationId = registration.Id, RowNumber = row.RowNumber,
                RowType = row.RowType, DisplayName = row.DisplayName.Trim(), Email = NormalizeEmail(row.Email),
                ClassName = string.IsNullOrWhiteSpace(row.ClassName) ? null : row.ClassName.Trim(),
                IsActive = true, CreatedAt = now
            });
    }

    public static AuditLog Audit(GroupRegistration registration, Guid actor, string action, DateTimeOffset now, Guid? key = null) =>
        new()
        {
            ActorUserId = actor, TourId = registration.TourId, CorrelationId = key, Action = action,
            EntityType = RegistrationEntityType, EntityId = registration.Id.ToString("D"),
            ResultCode = "SUCCESS", OccurredAt = now
        };
}

internal sealed record GateDecision(bool Allowed, string? Reason = null, string? Code = null);
