using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.TourTalk;

/// <summary>Resolves the Student session cookie to its invited row for Tour talk (ADR-0070), as Q&amp;A and the vote do.</summary>
public static class TourTalkViewerAccess
{
    public static async Task<TourTalkViewer> ResolveAsync(ITourTalkReader reader, IInvitationCodeService codes,
        InvitationSettings settings, Guid tourId, string? sessionToken, DateTimeOffset now, CancellationToken ct)
    {
        if (!settings.Enabled || string.IsNullOrEmpty(sessionToken)) throw Invalid();
        var tokenHash = codes.Hash("browser-session:" + sessionToken);
        return await reader.FindViewerAsync(tourId, tokenHash, now, ct) ?? throw Invalid();
    }

    private static UnauthorizedException Invalid() => new("Mã truy cập hoặc phiên không hợp lệ, đã hết hạn hoặc bị thu hồi.");
}
