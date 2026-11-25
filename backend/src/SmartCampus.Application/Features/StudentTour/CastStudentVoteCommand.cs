using FluentValidation;
using MediatR;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Abstractions.Messaging;
using SmartCampus.Application.Common.Abstractions.Persistence;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Domain.Entities;

namespace SmartCampus.Application.Features.StudentTour;

/// <summary>
/// A Viewer votes for the next POI (ADR-0065 rule 5). The vote belongs to the session's roster row, not the browser: one
/// per row per ballot, changed in place until the ballot closes. Under the Tour root lock, so it never lands after the
/// ballot was closed by Next, a lock or the deadline.
/// </summary>
public sealed record CastStudentVoteCommand(Guid TourId, string? SessionToken, Guid StopVisitId, Guid StopId)
    : ITourMutationCommand<TourBallotView>;

public sealed class CastStudentVoteCommandValidator : AbstractValidator<CastStudentVoteCommand>
{
    public CastStudentVoteCommandValidator()
    {
        RuleFor(c => c.TourId).NotEmpty();
        RuleFor(c => c.StopVisitId).NotEmpty();
        RuleFor(c => c.StopId).NotEmpty();
    }
}

public sealed class CastStudentVoteCommandHandler(ITourVoteRepository votes, IRegistrationRepository registrations,
    IRouteRevisionRepository revisions, IInvitationCodeService codes, InvitationSettings settings, TimeProvider clock,
    ITourManagementRepository tours, TourBallotSignalQueue signals)
    : IRequestHandler<CastStudentVoteCommand, TourBallotView>
{
    private static UnauthorizedException Invalid() =>
        new("Mã truy cập hoặc phiên không hợp lệ, đã hết hạn hoặc bị thu hồi.");

    private static ConflictException Closed() =>
        new("Cuộc bình chọn điểm tiếp theo đã đóng hoặc chưa mở.", TourVoteCodes.VoteClosed);

    public async Task<TourBallotView> Handle(CastStudentVoteCommand command, CancellationToken ct)
    {
        if (!settings.Enabled || string.IsNullOrEmpty(command.SessionToken)) throw Invalid();
        var tokenHash = codes.Hash("browser-session:" + command.SessionToken);
        var tour = await registrations.LockTourAsync(command.TourId, ct) ?? throw Invalid();
        var now = clock.GetUtcNow();
        // The same session rules as Q&A, read under the Tour lock that revocation also takes.
        var row = await votes.FindVoterRowAsync(command.TourId, tokenHash, now, ct) ?? throw Invalid();

        if (tour.CurrentStopVisitId != command.StopVisitId || tour.RouteRevisionId is not { } revisionId) throw Closed();
        var revision = await revisions.FindRevisionAsync(revisionId, ct);
        if (revision is not { ViewerChoosesNextStop: true }) throw Closed();
        var state = await TourVoting.LoadAsync(votes, tour, revision, await revisions.GetStopsAsync(revision.Id, ct), ct);
        if (state.Current is not { } visit || !TourVoting.IsOpen(tour, visit, now)) throw Closed();
        if (!state.IsCandidate(command.StopId))
            throw new ConflictException("Điểm này không còn trong danh sách bình chọn.", TourVoteCodes.CandidateInvalid);

        if (state.Records.Votes.SingleOrDefault(vote => vote.RosterRowId == row) is { } existing)
            (existing.RouteRevisionStopId, existing.UpdatedAt) = (command.StopId, now);
        else
        {
            var vote = new TourStopVote
            {
                Id = Guid.NewGuid(), TourId = tour.Id, StopVisitId = visit.Id, RosterRowId = row, RouteRevisionStopId = command.StopId,
                VotedAt = now, UpdatedAt = now
            };
            votes.Add(vote);
            state = new TourVotingState(tour, revision, state.Stops, state.Records with { Votes = [.. state.Records.Votes, vote],
                CountedRowIds = new HashSet<Guid>(state.Records.CountedRowIds) { row } });
        }
        var ballot = TourVoting.Ballot(state, now, row)!;
        // Pushed to the Staff consoles once this vote has committed (TourBallotNotificationBehavior), without the voter.
        signals.Add(new TourBallotSignal(tour.Id, ballot with { MyVote = null }, TourVoting.LeadingStopId(state, now),
            ballot.Candidates.Sum(candidate => candidate.Votes), await tours.GetViewerPresenceAsync(tour.Id, now, ct), now));
        return ballot;
    }
}
