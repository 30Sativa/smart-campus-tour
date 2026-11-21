using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Tours;

namespace SmartCampus.Application.Features.StudentTour;

/// <summary>
/// <see cref="StopId"/>, <see cref="Progress"/> (VISITED, SKIPPED, CURRENT, NEXT, REMAINING) and <see cref="LockReason"/> are
/// set only on a route where Viewers choose the next stop (ADR-0065); <see cref="StopId"/> is what a vote names.
/// </summary>
public sealed record StudentTourStop(int Order, Guid PoiId, string Name, string? Description, string? NarrationText,
    string? AudioUrl, int? NarrationSeconds, int DwellSeconds, Guid? StopId = null, string? Progress = null, string? LockReason = null);

/// <summary>
/// Progress of a RUNNING Tour, copied from its progress columns. <c>Step</c> is the Tour's CurrentStep and is null
/// until the first dispatch writes it.
/// </summary>
public sealed record StudentTourProgress(string? Step, Guid? CurrentPoiId, Guid? LastArrivedPoiId, bool NeedsAssistance,
    bool IsHeld);

/// <summary><see cref="Ballot"/> is null when the route does not vote or no POI is current (ADR-0065).</summary>
public sealed record StudentTourView(IReadOnlyList<StudentTourStop> Stops, StudentTourProgress? Progress, TourBallotView? Ballot = null);

/// <summary>Route and progress for the invited Student page (docs/architecture.md §3.2.3). Read-only.</summary>
public sealed record GetStudentTourViewQuery(Guid TourId, string? SessionToken) : IQuery<StudentTourView>;

public sealed class GetStudentTourViewQueryHandler(IStudentAccessRepository access, IStudentTourViewReader reader,
    IInvitationCodeService codes, InvitationSettings settings, TimeProvider clock, ITourVoteRepository votes)
    : IRequestHandler<GetStudentTourViewQuery, StudentTourView>
{
    private static UnauthorizedException Invalid() =>
        new("Mã truy cập hoặc phiên không hợp lệ, đã hết hạn hoặc bị thu hồi.");

    public async Task<StudentTourView> Handle(GetStudentTourViewQuery query, CancellationToken ct)
    {
        if (!settings.Enabled || string.IsNullOrEmpty(query.SessionToken)) throw Invalid();
        var tokenHash = codes.Hash("browser-session:" + query.SessionToken);
        // Same session rules as Q&A (open, unexpired, unrevoked, active ACCEPTED row), in any Tour state.
        var now = clock.GetUtcNow();
        _ = await access.FindQuestionAccessAsync(query.TourId, tokenHash, now, ct) ?? throw Invalid();
        var data = await reader.LoadAsync(query.TourId, ct) ?? throw Invalid();
        var stops = data.Stops
            .Select(s => new StudentTourStop(s.Order, s.PoiId, s.Name, s.Description, s.NarrationText,
                SafeAudioUrl(s.AudioUrl), s.NarrationSeconds, s.DwellSeconds))
            .ToList();
        var progress = data.State == "RUNNING"
            ? new StudentTourProgress(data.CurrentStep, data.CurrentPoiId, data.LastArrivedPoiId,
                data.OperationalStatus == "NEEDS_ASSISTANCE", data.IsHeld)
            : null;
        if (await votes.FindVotingRouteAsync(query.TourId, ct) is not { } route) return new StudentTourView(stops, progress);

        var state = await TourVoting.LoadAsync(votes, route.Tour, route.Revision, route.Stops, ct);
        var locks = TourVoting.Locks(state).ToDictionary(item => item.StopId, item => item.Reason);
        var byOrder = route.Stops.ToDictionary(stop => stop.StopOrder);
        stops = stops.Select(stop => byOrder.TryGetValue(stop.Order, out var revisionStop)
            ? stop with { StopId = revisionStop.Id, Progress = TourVoting.Progress(state, revisionStop.Id, now),
                LockReason = locks.GetValueOrDefault(revisionStop.Id) }
            : stop).ToList();
        var row = await votes.FindVoterRowAsync(query.TourId, tokenHash, now, ct);
        return new StudentTourView(stops, progress, TourVoting.Ballot(state, now, row));
    }

    /// <summary>
    /// The browser plays POI audio directly, so only an https URL without credentials or a same-site path is passed
    /// on; anything else becomes null.
    /// </summary>
    public static string? SafeAudioUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        url = url.Trim();
        if (url.StartsWith('/'))
            return url.StartsWith("//", StringComparison.Ordinal) || url.Contains('\\') ? null : url;
        return Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps
            && string.IsNullOrEmpty(uri.UserInfo) ? url : null;
    }
}
