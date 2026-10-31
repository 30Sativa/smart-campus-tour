using System.Globalization;
using System.Net;
using SmartCampus.Application.Common.Abstractions.Invitations;

namespace SmartCampus.Infrastructure.Integrations.Invitations;

internal static class TourCancelEmailTemplate
{
    internal static (string Html, string Text) Render(TourCancelEmail email, string supportEmail)
    {
        var scheduled = email.ScheduledStartAt.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
        var tourName = WebUtility.HtmlEncode(email.TourName);
        var reason = WebUtility.HtmlEncode(email.Reason);
        var support = WebUtility.HtmlEncode(supportEmail);
        var supportLink = WebUtility.HtmlEncode("mailto:" + supportEmail);
        var text = "CAMPUS TOUR · DT-AMR\n\nBuổi tham quan đã bị hủy\n\n" +
            $"Buổi tham quan: {email.TourName}\nGiờ dự kiến: {scheduled} (UTC+7)\nLý do: {email.Reason}\n\n" +
            "Các lời mời của buổi này không còn dùng được. Đăng ký của đoàn vẫn được lưu để bạn xem lại.\n\n" +
            $"Đây là email tự động, vui lòng không trả lời. Cần hỗ trợ? Liên hệ {supportEmail}.";
        var html = $$"""
            <!doctype html>
            <html lang="vi">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <meta name="color-scheme" content="light">
              <title>Thông báo hủy buổi tham quan CampusTour</title>
            </head>
            <body style="margin:0;padding:0;background-color:#f5f7f8;color:#0b1519;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f7f8;">
                <tr><td align="center" style="padding:40px 16px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e1e7ea;border-radius:16px;">
                    <tr><td style="padding:24px 28px;background-color:#0b292f;border-radius:16px 16px 0 0;color:#ffffff;font-size:22px;font-weight:bold;">CampusTour<span style="color:#52c0cb;">.</span></td></tr>
                    <tr><td style="padding:36px 36px 32px;">
                      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:bold;">Buổi tham quan đã bị hủy</h1>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f7f8;border-radius:10px;">
                        <tr><td style="padding:20px;">
                          <p style="margin:0 0 8px;color:#596c73;font-size:11px;font-weight:bold;letter-spacing:1px;">CHUYẾN THAM QUAN</p>
                          <p style="margin:0 0 16px;font-size:17px;line-height:25px;font-weight:bold;overflow-wrap:anywhere;word-break:break-word;">{{tourName}}</p>
                          <p style="margin:0 0 12px;color:#45585f;font-size:13px;line-height:22px;">Giờ dự kiến <strong style="color:#0b1519;">{{scheduled}}</strong> (Giờ Việt Nam · UTC+7)</p>
                          <p style="margin:0;color:#45585f;font-size:13px;line-height:22px;overflow-wrap:anywhere;word-break:break-word;">Lý do: <strong style="color:#0b1519;">{{reason}}</strong></p>
                        </td></tr>
                      </table>
                      <p style="margin:24px 0 0;color:#45585f;font-size:14px;line-height:23px;">Các lời mời của buổi này không còn dùng được. Đăng ký của đoàn vẫn được lưu để bạn xem lại.</p>
                    </td></tr>
                    <tr><td style="padding:22px 24px;background-color:#f5f7f8;border-top:1px solid #e1e7ea;border-radius:0 0 16px 16px;text-align:center;">
                      <p style="margin:0 0 6px;color:#45585f;font-size:12px;line-height:20px;">Cần hỗ trợ? <a href="{{supportLink}}" style="color:#0a6d80;text-decoration:underline;overflow-wrap:anywhere;">{{support}}</a></p>
                      <p style="margin:0;color:#596c73;font-size:11px;line-height:18px;">Đây là email tự động, vui lòng không trả lời.</p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;
        return (html, text);
    }
}
