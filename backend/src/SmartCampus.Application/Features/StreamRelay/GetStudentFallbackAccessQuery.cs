using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.StreamRelay;

/// <summary>
/// ADR-0063: a relay token for the Tour's fallback video, asked by the Student page when the live picture is lost.
/// Same session rules as the live token; the Tour must be RUNNING and have a fallback video. Read-only: not an ICommand.
/// </summary>
public sealed record GetStudentFallbackAccessQuery(Guid TourId, string? SessionToken) : IRequest<StreamAccess>;

public sealed class GetStudentFallbackAccessQueryHandler(IStudentAccessRepository access, IInvitationCodeService codes,
    InvitationSettings invitations, StreamEntitlement entitlement, TimeProvider clock)
    : IRequestHandler<GetStudentFallbackAccessQuery, StreamAccess>
{
    public async Task<StreamAccess> Handle(GetStudentFallbackAccessQuery query, CancellationToken ct)
    {
        if (!invitations.Enabled || string.IsNullOrEmpty(query.SessionToken)) throw Invalid();
        var tokenHash = codes.Hash("browser-session:" + query.SessionToken);
        var session = await access.FindQuestionAccessAsync(query.TourId, tokenHash, clock.GetUtcNow(), ct) ?? throw Invalid();
        if (!await entitlement.StudentMayWatchFallbackAsync(session.SessionId, query.TourId, ct))
            throw StreamAccessErrors.FallbackNotAvailable_();
        return entitlement.IssueFallback(session.SessionId, query.TourId);
    }

    private static UnauthorizedException Invalid() =>
        new("Mã truy cập hoặc phiên không hợp lệ, đã hết hạn hoặc bị thu hồi.");
}
