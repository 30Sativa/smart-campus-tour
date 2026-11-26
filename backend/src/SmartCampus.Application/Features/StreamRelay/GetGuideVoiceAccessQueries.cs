using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.TourTalk;

namespace SmartCampus.Application.Features.StreamRelay;

/// <summary>ADR-0072: the Operator's WHIP address and token to speak live to the Tour's Viewers. Read-only: not an ICommand.</summary>
public sealed record GetStaffGuideVoiceAccessQuery(Guid TourId, Guid Actor) : IRequest<GuideVoiceAccess>;

public sealed class GetStaffGuideVoiceAccessQueryHandler(ITourTalkReader reader, StreamRelaySettings settings,
    GuideVoiceEntitlement entitlement, TimeProvider clock) : IRequestHandler<GetStaffGuideVoiceAccessQuery, GuideVoiceAccess>
{
    public async Task<GuideVoiceAccess> Handle(GetStaffGuideVoiceAccessQuery query, CancellationToken ct)
    {
        var tour = await reader.GetTourAsync(query.TourId, ct) ?? throw new NotFoundException("Không tìm thấy Tour.");
        if (tour.OperatorUserId != query.Actor)
            throw new ForbiddenException("Chỉ người vận hành được giao cho Tour mới nói chuyện với người xem được.");
        TourTalkWindow.EnsureOpen(tour.State, tour.ScheduledStartAt, clock.GetUtcNow());
        if (!settings.Enabled) throw GuideVoiceErrors.NotAvailable_();
        return entitlement.IssuePublish(query.Actor, query.TourId);
    }
}

/// <summary>ADR-0072: a Viewer's WHEP address and token to hear the guide live. Same session rules as Tour talk. Read-only.</summary>
public sealed record GetStudentGuideVoiceAccessQuery(Guid TourId, string? SessionToken) : IRequest<GuideVoiceAccess>;

public sealed class GetStudentGuideVoiceAccessQueryHandler(IStudentAccessRepository access, IInvitationCodeService codes,
    InvitationSettings invitations, ITourTalkReader reader, StreamRelaySettings settings, GuideVoiceEntitlement entitlement,
    TimeProvider clock) : IRequestHandler<GetStudentGuideVoiceAccessQuery, GuideVoiceAccess>
{
    public async Task<GuideVoiceAccess> Handle(GetStudentGuideVoiceAccessQuery query, CancellationToken ct)
    {
        if (!invitations.Enabled || string.IsNullOrEmpty(query.SessionToken)) throw Invalid();
        var now = clock.GetUtcNow();
        var tokenHash = codes.Hash("browser-session:" + query.SessionToken);
        var session = await access.FindQuestionAccessAsync(query.TourId, tokenHash, now, ct) ?? throw Invalid();
        var tour = await reader.GetTourAsync(query.TourId, ct) ?? throw Invalid();
        TourTalkWindow.EnsureOpen(tour.State, tour.ScheduledStartAt, now);
        if (!settings.Enabled) throw GuideVoiceErrors.NotAvailable_();
        return entitlement.IssueListen(session.SessionId, query.TourId);
    }

    private static UnauthorizedException Invalid() =>
        new("Mã truy cập hoặc phiên không hợp lệ, đã hết hạn hoặc bị thu hồi.");
}
