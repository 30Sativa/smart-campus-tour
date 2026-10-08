using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.Registrations;

// Invariants used by every registration writer under the same Tour lock.
public static class RegistrationConsistency
{
    public const string Scheduled = "SCHEDULED";
    public const string Submitted = "SUBMITTED";
    public const string Approved = "APPROVED";
    public const string Rejected = "REJECTED";
    public const string Cancelled = "CANCELLED";
    public const string EmailReserved = "Có email đã được đăng ký trong Tour này. Kiểm tra lại danh sách.";
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

    public static IReadOnlyDictionary<string, string[]> EmailErrors(IReadOnlyList<int> indexes) =>
        indexes.ToDictionary(index => $"Roster[{index}].Email",
            _ => new[] { "Email đã được đăng ký trong Tour này." });

}
