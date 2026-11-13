using System.Globalization;

namespace SmartCampus.Infrastructure.Integrations.Invitations;

/// <summary>Copy shared by the invitation, cancel and roster-expiry emails.</summary>
internal static class EmailCopy
{
    internal const string Footer = "Gửi từ CampusTour, Trường Đại học FPT TP.HCM";

    /// <summary>Asia/Ho_Chi_Minh wall-clock time. Vietnam has a fixed UTC+7 offset and no daylight saving.</summary>
    internal static string VietnamTime(DateTimeOffset value, string format) =>
        value.ToOffset(TimeSpan.FromHours(7)).ToString(format, CultureInfo.InvariantCulture);
}
