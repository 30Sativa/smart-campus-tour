using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;

namespace SmartCampus.Application.Features.StreamRelay;

/// <summary>
/// ADR-0055: a relay token for the Student page. Same session rules as the Tour view; the Tour must use the relay's
/// robot and be RUNNING or in its waiting room. Read-only: not an ICommand, so no SQL transaction runs.
/// </summary>
public sealed record GetStudentStreamAccessQuery(Guid TourId, string? SessionToken) : IRequest<StreamAccess>;

public sealed class GetStudentStreamAccessQueryHandler(IStudentAccessRepository access, IInvitationCodeService codes,
    InvitationSettings invitations, StreamEntitlement entitlement, TimeProvider clock)
    : IRequestHandler<GetStudentStreamAccessQuery, StreamAccess>
{
    public async Task<StreamAccess> Handle(GetStudentStreamAccessQuery query, CancellationToken ct)
    {
        if (!invitations.Enabled || string.IsNullOrEmpty(query.SessionToken)) throw Invalid();
        var tokenHash = codes.Hash("browser-session:" + query.SessionToken);
        var session = await access.FindQuestionAccessAsync(query.TourId, tokenHash, clock.GetUtcNow(), ct) ?? throw Invalid();
        if (!await entitlement.StudentMayWatchAsync(session.SessionId, ct))
            throw StreamAccessErrors.NotAvailable_();
        return entitlement.Issue(StreamTokenKinds.Student, session.SessionId);
    }

    private static UnauthorizedException Invalid() =>
        new("Mã truy cập hoặc phiên không hợp lệ, đã hết hạn hoặc bị thu hồi.");
}
