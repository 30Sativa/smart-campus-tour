using System.Net;
using SmartCampus.Application.Common.Abstractions.Invitations;

namespace SmartCampus.Infrastructure.Integrations.Invitations;

internal static class TourEndedEarlyEmailTemplate
{
    internal const string Heading = "Buổi tham quan đã kết thúc sớm";
    internal const string Message = "Buổi tham quan hôm nay phải kết thúc sớm vì sự cố vận hành. Nhà trường sẽ liên hệ lại về buổi bù (nếu có).";
    internal static string Subject(TourCancelEmail email) => $"{Heading}: {email.TourName}, {EmailCopy.VietnamTime(email.ScheduledStartAt, "dd/MM")}";
    internal static (string Html, string Text) Render(TourCancelEmail email)
    {
        var scheduled = EmailCopy.VietnamTime(email.ScheduledStartAt, "dd/MM/yyyy HH:mm");
        var text = $"CAMPUS TOUR · DT-AMR\n\n{Heading}\n\nBuổi tham quan: {email.TourName}\nGiờ bắt đầu dự kiến: {scheduled} (UTC+7)\n\n{Message}\n\n{EmailCopy.Footer}";
        var html = $"<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\"><title>{Heading}</title></head><body style=\"font-family:Arial,Helvetica,sans-serif;color:#0b1519;padding:32px;max-width:600px\"><h1>{Heading}</h1><p>Buổi tham quan: <strong>{WebUtility.HtmlEncode(email.TourName)}</strong></p><p>Giờ bắt đầu dự kiến: {scheduled} (UTC+7)</p><p>{Message}</p><p>{EmailCopy.Footer}</p></body></html>";
        return (html, text);
    }
}
