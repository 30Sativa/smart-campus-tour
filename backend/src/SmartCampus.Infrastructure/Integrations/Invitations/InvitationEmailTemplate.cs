using System.Globalization;
using System.Net;
using SmartCampus.Application.Common.Abstractions.Invitations;

namespace SmartCampus.Infrastructure.Integrations.Invitations;

internal static class InvitationEmailTemplate
{
    internal static (string Html, string Text) Render(InvitationEmail email, string code, string link, string supportEmail)
    {
        var scheduled = email.ScheduledStartAt.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
        var expires = email.ExpiresAt.ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
        var tourName = WebUtility.HtmlEncode(email.TourName);
        var tourLink = WebUtility.HtmlEncode(link);
        var accessCode = WebUtility.HtmlEncode(code);
        var support = WebUtility.HtmlEncode(supportEmail);
        var supportLink = WebUtility.HtmlEncode("mailto:" + supportEmail);
        var text = $"CAMPUS TOUR · DT-AMR\n\nLời mời tham quan campus\n\n" +
            $"Bạn được mời tham gia {email.TourName}.\nGiờ dự kiến: {scheduled} (UTC+7).\n\n" +
            $"Mã truy cập: {code}\nHết hạn: {expires} (UTC+7).\n\n" +
            $"1. Mở trang Tour: {link}\n2. Sao chép/dán mã truy cập rồi bấm Tham gia.\n\n" +
            "Không chia sẻ mã. Mã dùng lại trong hạn lời mời; gửi lại email giữ nguyên mã.\n" +
            "Thông tin đăng ký được dùng để gửi lời mời và hỗ trợ quyền truy cập Tour.\n\n" +
            $"Đây là email tự động, vui lòng không trả lời. Cần hỗ trợ? Liên hệ {supportEmail}.";
        var html = $$"""
            <!doctype html>
            <html lang="vi">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <meta name="color-scheme" content="light">
              <title>Lời mời tham quan CampusTour</title>
              <style>
                @media screen and (max-width: 600px) {
                  .outer { padding: 16px 8px !important; }
                  .content { padding: 28px 20px !important; }
                  .title { font-size: 28px !important; }
                  .code { font-size: 18px !important; letter-spacing: 0 !important; }
                }
              </style>
            </head>
            <body style="margin:0;padding:0;background-color:#f5f7f8;color:#0b1519;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
              <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Lịch tham quan và hướng dẫn tham gia CampusTour của bạn đã sẵn sàng.</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f7f8;">
                <tr><td class="outer" align="center" style="padding:40px 16px;">
                  <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e1e7ea;border-radius:16px;">
                    <tr><td style="padding:24px 28px;background-color:#0b292f;border-radius:16px 16px 0 0;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">CampusTour<span style="color:#52c0cb;">.</span></td>
                          <td align="right" style="color:#b8d8dc;font-size:11px;letter-spacing:2px;">DT-AMR</td>
                        </tr>
                      </table>
                    </td></tr>
                    <tr><td class="content" style="padding:36px 36px 32px;">
                      <p style="margin:0 0 12px;color:#0a6d80;font-size:11px;line-height:18px;font-weight:bold;letter-spacing:2px;">KHÁM PHÁ CAMPUS TỪ XA</p>
                      <h1 class="title" style="margin:0 0 16px;font-size:32px;line-height:1.2;letter-spacing:-1px;font-weight:bold;">Lời mời tham quan<br>campus của bạn</h1>
                      <p style="margin:0 0 24px;color:#45585f;font-size:15px;line-height:24px;">Khám phá không gian học tập cùng CampusTour. Dưới đây là lịch tham quan và mã truy cập dành cho lời mời của bạn.</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f7f8;border-radius:10px;">
                        <tr><td style="padding:20px;">
                          <p style="margin:0 0 8px;color:#596c73;font-size:11px;font-weight:bold;letter-spacing:1px;">CHUYẾN THAM QUAN</p>
                          <p style="margin:0 0 16px;font-size:17px;line-height:25px;font-weight:bold;overflow-wrap:anywhere;word-break:break-word;">{{tourName}}</p>
                          <p style="margin:0;color:#45585f;font-size:13px;line-height:22px;">Giờ dự kiến <strong style="color:#0b1519;">{{scheduled}}</strong><br><span style="color:#596c73;font-size:12px;">Giờ Việt Nam · UTC+7</span></p>
                        </td></tr>
                      </table>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border:1px solid #b8dadd;border-radius:10px;background-color:#f0f8f9;">
                        <tr><td align="center" style="padding:22px 12px;">
                          <p style="margin:0 0 12px;color:#0a6d80;font-size:13px;font-weight:bold;">Mã truy cập</p>
                          <p class="code" style="margin:0;color:#0b292f;font-family:Consolas,'Courier New',monospace;font-size:23px;line-height:32px;font-weight:bold;letter-spacing:0.5px;white-space:nowrap;">{{accessCode}}</p>
                          <p style="margin:12px 0 0;color:#45585f;font-size:12px;line-height:20px;">Hết hạn: <strong>{{expires}}</strong> (UTC+7)</p>
                        </td></tr>
                      </table>
                      <p style="margin:24px 0 18px;color:#45585f;font-size:14px;line-height:23px;">Mở trang Tour, sao chép/dán <strong style="color:#0b1519;">Mã truy cập</strong> ở trên rồi bấm <strong style="color:#0b1519;">Tham gia</strong>.</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr><td align="center" bgcolor="#0a6d80" style="border-radius:8px;mso-padding-alt:16px 24px;">
                          <a href="{{tourLink}}" style="display:block;padding:16px 24px;color:#ffffff;font-size:15px;line-height:20px;font-weight:bold;text-align:center;text-decoration:none;border-radius:8px;">Mở trang Tour &rarr;</a>
                        </td></tr>
                      </table>
                      <p style="margin:16px 0 0;color:#596c73;font-size:12px;line-height:20px;">Nếu nút không hoạt động, mở đường dẫn sau:<br><a href="{{tourLink}}" style="color:#0a6d80;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">{{tourLink}}</a></p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-top:1px solid #e1e7ea;">
                        <tr><td style="padding-top:20px;">
                          <p style="margin:0 0 6px;color:#45585f;font-size:12px;line-height:20px;"><strong style="color:#0b1519;">Giữ mã truy cập riêng tư.</strong> Không chia sẻ mã. Mã dùng lại trong hạn lời mời; gửi lại email giữ nguyên mã.</p>
                          <p style="margin:0;color:#596c73;font-size:12px;line-height:20px;">Thông tin đăng ký được dùng để gửi lời mời và hỗ trợ quyền truy cập Tour.</p>
                        </td></tr>
                      </table>
                    </td></tr>
                    <tr><td style="padding:22px 24px;background-color:#f5f7f8;border-top:1px solid #e1e7ea;border-radius:0 0 16px 16px;text-align:center;">
                      <p style="margin:0 0 6px;color:#45585f;font-size:12px;line-height:20px;">Cần hỗ trợ? <a href="{{supportLink}}" style="color:#0a6d80;text-decoration:underline;overflow-wrap:anywhere;">{{support}}</a></p>
                      <p style="margin:0;color:#596c73;font-size:11px;line-height:18px;">Đây là email tự động, vui lòng không trả lời.<br>CampusTour · Trải nghiệm campus cùng DT-AMR</p>
                    </td></tr>
                  </table>
                  <!--[if mso]></td></tr></table><![endif]-->
                </td></tr>
              </table>
            </body>
            </html>
            """;
        return (html, text);
    }
}
