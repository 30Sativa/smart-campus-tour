using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartCampus.Application.Common.Abstractions.Invitations;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.MapPoi;
using SmartCampus.Application.Features.StudentTour;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.AutoAdvanceTour;
using SmartCampus.Application.Features.Tours.Commands.LockTourStop;
using SmartCampus.Application.Features.Tours.Commands.NextTourStop;
using SmartCampus.Application.Features.Tours.Commands.RecoverTourAfterRestart;
using SmartCampus.Application.Features.Tours.Commands.SkipTourStop;
using SmartCampus.Application.Features.Tours.Queries.GetTour;
using SmartCampus.Domain.Entities;
using static SmartCampus.IntegrationTests.TourHappyPathSqlTests;
using World = SmartCampus.IntegrationTests.TourStartPreflightSqlTests.World;

namespace SmartCampus.IntegrationTests;

/// <summary>
/// ADR-0065 Workflow C through the Application handlers on SQL: visits and ballots, votes per roster row, the decision at
/// Next, the automatic Next and a restart, POI locks and Skip. The voting route is the harness route with a third POI
/// added and the flag set in SQL, so these tests do not depend on the route save rules.
/// </summary>
public sealed class TourVotingSqlTests
{
    [SchemaV11Fact]
    public async Task Votes_AreOnePerRosterRow_ChangedInPlace_AndNextGoesToTheWinnerThenThroughTheRouteToTheEnd()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        var route = await Voting(w);
        var ana = await Viewer(w, "ana");
        var binh = await Viewer(w, "binh");
        await ArriveAtFirst(w);
        var visit = await CurrentVisit(w);
        Assert.NotNull(visit.BallotClosesAt);
        Assert.Equal((await w.H.Detail()).Execution!.DwellDeadlineAt, visit.BallotClosesAt);

        await Vote(w, ana.Token, visit.Id, route.Lab);
        // A new browser session of the same row (reload, re-issued code) changes that row's one vote.
        var again = await Session(w, ana.Invitation);
        var ballot = await Vote(w, again, visit.Id, route.Hall);
        Assert.Equal(route.Hall, ballot.MyVote);
        ballot = await Vote(w, binh.Token, visit.Id, route.Hall);
        Assert.True(ballot.Open);
        Assert.Equal([(route.Lab, 0), (route.Hall, 2)], ballot.Candidates.Select(c => (c.StopId, c.Votes)));
        Assert.Null(ballot.Decision);
        await using (var db = w.H.Context())
            Assert.Equal(2, await db.TourStopVotes.CountAsync(v => v.StopVisitId == visit.Id));

        var detail = await w.H.Detail();
        Assert.Equal(route.Hall, detail.LeadingStopId);
        Assert.Equal(new TourNextTargetView("POI", route.Hall, "Hội trường"), detail.NextTarget);
        Assert.Equal(visit.Id, detail.Ballot!.StopVisitId);

        await Next(w);
        Assert.Equal(route.Hall, (await w.H.Detail()).Execution!.CurrentRevisionStopId);
        visit = await Visit(w, visit.Id);
        Assert.Equal((route.Hall, NextStopReasons.Vote, 2), (visit.ChosenRevisionStopId!.Value, visit.ChosenReason, visit.ChosenVoteCount!.Value));
        Assert.Equal(w.Clock.Now, visit.BallotClosedAt);
        var chosen = await Events(w, TourLifecycleEvents.NextStopChosen);
        var data = JsonDocument.Parse(Assert.Single(chosen).DataJson!).RootElement;
        Assert.Equal((route.Hall, "VOTE", 2), (data.GetProperty("winnerStopId").GetGuid(), data.GetProperty("reason").GetString(), data.GetProperty("votes").GetInt32()));
        Assert.Equal(2, data.GetProperty("counts").GetArrayLength());
        Assert.Equal("VOTE_CLOSED", (await VoteRefused(w, binh.Token, visit.Id, route.Lab)).Code);

        // At the hall only the lab is left: no ballot, decided at arrival.
        w.Clock.Now = w.Clock.Now!.Value.AddMinutes(1);
        await Arrive(w);
        var hall = await CurrentVisit(w);
        Assert.Equal((route.Hall, (DateTimeOffset?)null, (Guid?)route.Lab, NextStopReasons.SingleCandidate),
            (hall.RouteRevisionStopId, hall.BallotClosesAt, hall.ChosenRevisionStopId, hall.ChosenReason));
        Assert.Equal("VOTE_CLOSED", (await VoteRefused(w, again, hall.Id, route.Lab)).Code);
        var view = await w.H.Send(new GetStudentTourViewQuery(w.H.TourId, again));
        Assert.Equal(["VISITED", "CURRENT"], view.Stops.Where(s => s.Order != 2).Select(s => s.Progress));
        Assert.Equal("NEXT", view.Stops.Single(s => s.StopId == route.Lab).Progress);
        Assert.Equal((false, route.Lab, NextStopReasons.SingleCandidate), (view.Ballot!.Open, view.Ballot.Decision!.StopId, view.Ballot.Decision.Reason));

        await Next(w);
        Assert.Equal(route.Lab, (await w.H.Detail()).Execution!.CurrentRevisionStopId);
        w.Clock.Now = w.Clock.Now!.Value.AddMinutes(1);
        await Arrive(w);
        Assert.Null((await CurrentVisit(w)).BallotClosesAt);
        Assert.Equal(new TourNextTargetView("END", null, null), (await w.H.Detail()).NextTarget);
        await Next(w);
        var end = await w.H.Detail();
        Assert.Equal((TourRuntime.ReturningToEnd, (Guid?)null), (end.Execution!.CurrentStep, end.Execution.CurrentRevisionStopId));
        Assert.Equal([1, 3, 2], end.StopProgress!.Select(s => s.Order!.Value));
        Assert.All(end.StopProgress!, s => Assert.Equal("VISITED", s.Progress));
    }

    [SchemaV11Fact]
    public async Task SharedScreenRow_HasOneVote_AndARevokedRowIsNotCounted()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        var route = await Voting(w);
        var room = await Viewer(w, "room", "SHARED_VIEWING");
        var ana = await Viewer(w, "ana");
        var binh = await Viewer(w, "binh");
        await ArriveAtFirst(w);
        var visit = await CurrentVisit(w);

        await Vote(w, room.Token, visit.Id, route.Lab);
        await Vote(w, room.Token, visit.Id, route.Lab);
        await Vote(w, ana.Token, visit.Id, route.Hall);
        var ballot = await Vote(w, binh.Token, visit.Id, route.Hall);
        Assert.Equal([1, 2], ballot.Candidates.Select(c => c.Votes));

        await w.H.Database.ExecuteAsync($"UPDATE dbo.Invitations SET RevokedAt = SYSDATETIMEOFFSET() WHERE Id = '{binh.Invitation}';");
        var view = await w.H.Send(new GetStudentTourViewQuery(w.H.TourId, ana.Token));
        Assert.Equal([1, 1], view.Ballot!.Candidates.Select(c => c.Votes));
        Assert.Equal(route.Hall, view.Ballot.MyVote);
        await Assert.ThrowsAsync<UnauthorizedException>(() => Vote(w, binh.Token, visit.Id, route.Lab));

        await Next(w);
        visit = await Visit(w, visit.Id);
        // 1 : 1 once the revoked row is left out, so the smaller StopOrder wins; the revoked vote stays stored.
        Assert.Equal((route.Lab, NextStopReasons.TieDefault, 1), (visit.ChosenRevisionStopId!.Value, visit.ChosenReason, visit.ChosenVoteCount!.Value));
        await using var db = w.H.Context();
        Assert.Equal(3, await db.TourStopVotes.CountAsync(v => v.StopVisitId == visit.Id));
    }

    [SchemaV11Fact]
    public async Task VoteAfterTheDeadline_OrForANonCandidate_IsRefused_AndNoVotesGoesToTheSmallestStopOrder()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        var route = await Voting(w);
        var ana = await Viewer(w, "ana");
        await ArriveAtFirst(w);
        var visit = await CurrentVisit(w);

        Assert.Equal("VOTE_CANDIDATE_INVALID", (await VoteRefused(w, ana.Token, visit.Id, route.First)).Code);
        Assert.Equal("VOTE_CANDIDATE_INVALID", (await VoteRefused(w, ana.Token, visit.Id, Guid.NewGuid())).Code);
        Assert.Equal("VOTE_CLOSED", (await VoteRefused(w, ana.Token, Guid.NewGuid(), route.Lab)).Code);
        w.Clock.Now = visit.BallotClosesAt!.Value;
        Assert.Equal("VOTE_CLOSED", (await VoteRefused(w, ana.Token, visit.Id, route.Lab)).Code);
        var view = await w.H.Send(new GetStudentTourViewQuery(w.H.TourId, ana.Token));
        Assert.Equal((false, route.Lab, NextStopReasons.NoVotes), (view.Ballot!.Open, view.Ballot.Decision!.StopId, view.Ballot.Decision.Reason));

        w.Clock.Now = w.Clock.Now.Value.AddMinutes(2);
        await Next(w);
        visit = await Visit(w, visit.Id);
        // Closed at its own deadline, not when Next was pressed later.
        Assert.Equal((route.Lab, NextStopReasons.NoVotes, visit.BallotClosesAt), (visit.ChosenRevisionStopId!.Value, visit.ChosenReason, visit.BallotClosedAt));
    }

    [SchemaV11Fact]
    public async Task Lock_ClearsItsVotesInTheOpenBallot_ReChoosesTheDecidedPoi_AndOnlyLockedLeftBlocksNextUntilSkip()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        var route = await Voting(w);
        var ana = await Viewer(w, "ana");
        var binh = await Viewer(w, "binh");
        await ArriveAtFirst(w);
        var visit = await CurrentVisit(w);
        Assert.Equal("STOP_LOCK_INVALID", (await LockRefused(w, route.First)).Code);
        await Assert.ThrowsAsync<ForbiddenException>(() => w.H.Send(new LockTourStopCommand(w.H.TourId, route.Hall, w.H.StaffId, true, "Đang sửa")));

        await Vote(w, ana.Token, visit.Id, route.Hall);
        await Vote(w, binh.Token, visit.Id, route.Hall);
        await Lock(w, route.Hall, "Đang dọn dẹp");
        await using (var db = w.H.Context())
            Assert.All(await db.TourStopVotes.AsNoTracking().Where(v => v.StopVisitId == visit.Id).ToListAsync(), v => Assert.Null(v.RouteRevisionStopId));
        var view = await w.H.Send(new GetStudentTourViewQuery(w.H.TourId, ana.Token));
        Assert.Equal([route.Lab], view.Ballot!.Candidates.Select(c => c.StopId));
        Assert.Equal(new TourBallotLock(route.Hall, "Hội trường", "Đang dọn dẹp"), Assert.Single(view.Ballot.Locked));
        Assert.Equal("Đang dọn dẹp", view.Stops.Single(s => s.StopId == route.Hall).LockReason);
        Assert.Equal("VOTE_CANDIDATE_INVALID", (await VoteRefused(w, ana.Token, visit.Id, route.Hall)).Code);
        Assert.Equal("STOP_LOCK_INVALID", (await LockRefused(w, route.Hall)).Code);
        await w.H.Send(new LockTourStopCommand(w.H.TourId, route.Hall, w.H.OperatorId, false, "Đã dọn xong"));
        await Vote(w, ana.Token, visit.Id, route.Lab);
        await Vote(w, binh.Token, visit.Id, route.Lab);

        // The deadline passes with the lab decided; locking it before the robot leaves re-chooses.
        w.Clock.Now = visit.BallotClosesAt!.Value.AddSeconds(1);
        await w.Report();
        await Lock(w, route.Lab, "Phòng lab có khách");
        visit = await Visit(w, visit.Id);
        Assert.Equal((route.Hall, NextStopReasons.LockedFallback), (visit.ChosenRevisionStopId!.Value, visit.ChosenReason));
        Assert.Equal([NextStopReasons.Vote, NextStopReasons.LockedFallback],
            (await Events(w, TourLifecycleEvents.NextStopChosen)).Select(e => e.ReasonCode));
        var locks = await Events(w, TourLifecycleEvents.StopLocked);
        Assert.Equal(["Đang dọn dẹp", "Phòng lab có khách"], locks.Select(e => e.ReasonNote));
        Assert.Equal("Đã dọn xong", Assert.Single(await Events(w, TourLifecycleEvents.StopUnlocked)).ReasonNote);
        Assert.Equal(route.Hall, (await w.H.Detail()).NextTarget!.StopId);

        Assert.Equal("SKIP_NOT_ALLOWED", (await Assert.ThrowsAsync<ConflictException>(() => Skip(w))).Code);
        await Lock(w, route.Hall, "Hội trường đóng cửa");
        Assert.Equal("ALL_REMAINING_STOPS_LOCKED", (await Assert.ThrowsAsync<ConflictException>(() => Next(w))).Code);
        await w.Report();
        var detail = await w.H.Send(new GetTourQuery(w.H.TourId, w.H.OperatorId));
        Assert.Null(detail.NextTarget);
        Assert.Equal(["ALL_REMAINING_STOPS_LOCKED"], detail.AllowedActions!.Next.BlockedBy);
        Assert.True(detail.AllowedActions.Skip!.Allowed);

        await Skip(w);
        var end = await w.H.Detail();
        Assert.Equal(TourRuntime.ReturningToEnd, end.Execution!.CurrentStep);
        await using var check = w.H.Context();
        var skipped = await check.TourStopVisits.AsNoTracking().Where(v => v.Outcome == "SKIPPED").Select(v => v.RouteRevisionStopId).ToListAsync();
        Assert.Equal(new[] { route.Lab, route.Hall }.Order(), skipped.Order());
        Assert.Equal(2, await check.TourEvents.CountAsync(e => e.EventType == TourLifecycleEvents.StopSkipped));
        Assert.Equal(["VISITED", "SKIPPED", "SKIPPED"], end.StopProgress!.OrderBy(s => s.Order).Select(s => s.Progress));
    }

    [SchemaV11Fact]
    public async Task AutoAdvance_GoesToTheWinner_AndOnlyLockedLeftIsBlocked()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        var route = await Voting(w);
        var ana = await Viewer(w, "ana");
        await w.H.Send(new SetTourAutoAdvanceCommand(w.H.TourId, w.H.OperatorId, true));
        await ArriveAtFirst(w);
        var visit = await CurrentVisit(w);
        await Vote(w, ana.Token, visit.Id, route.Hall);

        w.Clock.Now = visit.BallotClosesAt!.Value.AddSeconds(1);
        await w.Report();
        Assert.True(await w.H.Send(new AutoAdvanceTourCommand(w.H.TourId)));
        Assert.Equal((TourRuntime.Navigating, (Guid?)route.Hall), ((await w.H.Detail()).Execution!.CurrentStep, (await w.H.Detail()).Execution!.CurrentRevisionStopId));
        Assert.Equal((route.Hall, NextStopReasons.Vote), ((await Visit(w, visit.Id)).ChosenRevisionStopId!.Value, (await Visit(w, visit.Id)).ChosenReason));

        await Arrive(w);
        await Lock(w, route.Lab, "Tạm đóng");
        w.Clock.Now = w.Clock.Now!.Value.AddMinutes(2);
        await w.Report();
        Assert.True(await w.H.Send(new AutoAdvanceTourCommand(w.H.TourId)));
        var blocked = await w.H.Detail();
        Assert.Equal((TourRuntime.Observing, "ALL_REMAINING_STOPS_LOCKED"), (blocked.Execution!.CurrentStep, blocked.Execution.AutoAdvance!.BlockedReason));
        Assert.Equal("ALL_REMAINING_STOPS_LOCKED", Assert.Single(await Events(w, TourLifecycleEvents.AutoAdvanceBlocked)).ReasonNote);
    }

    [SchemaV11Fact]
    public async Task Restart_ClosesTheOpenBallot_WithTheVotesAlreadyStored()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        var route = await Voting(w);
        var ana = await Viewer(w, "ana");
        await ArriveAtFirst(w);
        var visit = await CurrentVisit(w);
        await Vote(w, ana.Token, visit.Id, route.Hall);

        w.Clock.Now = w.Clock.Now!.Value.AddSeconds(5);
        Assert.True(await w.H.Send(new RecoverTourAfterRestartCommand(w.H.TourId)));
        visit = await Visit(w, visit.Id);
        Assert.Equal((w.Clock.Now, (Guid?)route.Hall, NextStopReasons.Vote), (visit.BallotClosedAt, visit.ChosenRevisionStopId, visit.ChosenReason));
        await using (var db = w.H.Context())
            Assert.Equal(route.Hall, (await db.TourStopVotes.AsNoTracking().SingleAsync(v => v.StopVisitId == visit.Id)).RouteRevisionStopId);
        Assert.Equal("VOTE_CLOSED", (await VoteRefused(w, ana.Token, visit.Id, route.Lab)).Code);
        var view = await w.H.Send(new GetStudentTourViewQuery(w.H.TourId, ana.Token));
        Assert.Equal((false, route.Hall), (view.Ballot!.Open, view.Ballot.Decision!.StopId));
    }

    [SchemaV11Fact]
    public async Task RouteWithoutTheFlag_RunsAsBefore_WithNoVisitsOrBallot()
    {
        await using var w = await World.Create(enabled: true, twoStopsToEndPose: true);
        var ana = await Viewer(w, "ana");
        await ArriveAtFirst(w);
        var stops = (await w.H.Detail()).RouteRevision!.Stops;
        var detail = await w.H.Detail();
        Assert.Null(detail.Ballot);
        Assert.Null(detail.StopProgress);
        Assert.Equal(new TourNextTargetView("POI", stops[1].Id, stops[1].Name), detail.NextTarget);
        var view = await w.H.Send(new GetStudentTourViewQuery(w.H.TourId, ana.Token));
        Assert.Null(view.Ballot);
        Assert.All(view.Stops, s => Assert.Null(s.Progress));
        Assert.Equal("VOTE_CLOSED", (await VoteRefused(w, ana.Token, (await w.H.Context().Tours.AsNoTracking().SingleAsync(t => t.Id == w.H.TourId)).CurrentStopVisitId!.Value, stops[1].Id)).Code);
        Assert.Equal("STOP_LOCK_INVALID", (await LockRefused(w, stops[1].Id)).Code);

        await Next(w);
        Assert.Equal(stops[1].Id, (await w.H.Detail()).Execution!.CurrentRevisionStopId);
        await using var db = w.H.Context();
        Assert.Empty(await db.TourStopVisits.ToListAsync());
        Assert.Empty(await db.TourEvents.Where(e => e.EventType == TourLifecycleEvents.NextStopChosen).ToListAsync());
    }

    private sealed record VotingRoute(Guid First, Guid Lab, Guid Hall);
    private sealed record TestViewer(Guid Row, Guid Invitation, string Token);

    /// <summary>The harness route (first POI, lab) gains a hall as StopOrder 3 and the ADR-0065 flag, written in SQL.</summary>
    private static async Task<VotingRoute> Voting(World w)
    {
        var h = w.H;
        Guid mapId;
        await using (var db = h.Context())
            mapId = await db.RouteRevisions.AsNoTracking().Where(r => r.Id == h.Route.RevisionId).Select(r => r.MapVersionId).SingleAsync();
        var proposal = await h.Send(new CreatePoiProposalCommand(h.StaffId, new(Guid.NewGuid(), new(mapId, "Hội trường", "Tham quan", null, 2.0m, 2.0m, 0m, "FRONT"))));
        var submitted = await h.Send(new SubmitPoiProposalCommand(h.StaffId, proposal.Id, new(Guid.NewGuid(), 1, proposal.RowVersion)));
        await h.Send(new RecordPoiVerificationCommand(h.TechnicalId, proposal.Id, 1, new(Guid.NewGuid(), 1, submitted.RowVersion,
            TourReadySqlTests.Robot, "PASS", true, true, true, true, null, "Kiểm tra tại chỗ.")));
        await h.Database.ExecuteAsync($"""
            INSERT INTO dbo.RouteRevisionStops (Id, RouteRevisionId, PoiProposalRevisionId, SourcePoiVerificationRecordId, MapVersionId,
                PoiNavigationFingerprint, StopOrder, DwellSeconds, HeadStepsJson, Name, X, Y, Yaw, CameraPreset, NarrationText)
            SELECT NEWID(), s.RouteRevisionId, p.Id, v.Id, s.MapVersionId, p.NavigationFingerprint, 3, 30, s.HeadStepsJson, p.Name,
                p.X, p.Y, p.Yaw, p.CameraPreset, s.NarrationText
            FROM dbo.RouteRevisionStops s JOIN dbo.PoiProposalRevisions p ON p.Id = '{proposal.Revision.Id}'
                JOIN dbo.PoiVerificationRecords v ON v.ProposalRevisionId = p.Id
            WHERE s.RouteRevisionId = '{h.Route.RevisionId}' AND s.StopOrder = 1;
            UPDATE dbo.RouteRevisions SET ViewerChoosesNextStop = 1 WHERE Id = '{h.Route.RevisionId}';
            -- A voting route needs PASS runs covering every leg (ADR-0065): first→lab→hall on the harness run, first→hall→lab
            -- on a copy recorded a second later.
            DECLARE @first NVARCHAR(36) = (SELECT CONVERT(NVARCHAR(36), Id) FROM dbo.RouteRevisionStops WHERE RouteRevisionId = '{h.Route.RevisionId}' AND StopOrder = 1);
            DECLARE @lab NVARCHAR(36) = (SELECT CONVERT(NVARCHAR(36), Id) FROM dbo.RouteRevisionStops WHERE RouteRevisionId = '{h.Route.RevisionId}' AND StopOrder = 2);
            DECLARE @hall NVARCHAR(36) = (SELECT CONVERT(NVARCHAR(36), Id) FROM dbo.RouteRevisionStops WHERE RouteRevisionId = '{h.Route.RevisionId}' AND StopOrder = 3);
            UPDATE dbo.RouteTestRuns SET TraversedStopIdsJson = CONCAT('["', @first, '","', @lab, '","', @hall, '"]')
            WHERE RouteRevisionId = '{h.Route.RevisionId}';
            INSERT INTO dbo.RouteTestRuns (Id, RouteRevisionId, NavigationFingerprint, MapVersionId, MapDeploymentCheckId, MapPackageSha256,
                RobotId, CheckedByUserId, ParticipatingStaffUserId, ResultCode, AllStopsReached, SafelyStopped, LocalizationPassed,
                MeasuredDurationSeconds, FailureReason, EvidenceNote, RequestId, RequestHash, CheckedAt, MeasurementBasis, TraversedStopIdsJson)
            SELECT TOP (1) NEWID(), RouteRevisionId, NavigationFingerprint, MapVersionId, MapDeploymentCheckId, MapPackageSha256,
                RobotId, CheckedByUserId, ParticipatingStaffUserId, ResultCode, AllStopsReached, SafelyStopped, LocalizationPassed,
                MeasuredDurationSeconds, FailureReason, EvidenceNote, NEWID(), RequestHash, DATEADD(SECOND, 1, CheckedAt), MeasurementBasis,
                CONCAT('["', @first, '","', @hall, '","', @lab, '"]')
            FROM dbo.RouteTestRuns WHERE RouteRevisionId = '{h.Route.RevisionId}' AND ResultCode = 'PASS' ORDER BY CheckedAt DESC;
            """);
        await using var check = h.Context();
        var stops = await check.RouteRevisionStops.AsNoTracking().Where(s => s.RouteRevisionId == h.Route.RevisionId)
            .OrderBy(s => s.StopOrder).Select(s => s.Id).ToArrayAsync();
        return new(stops[0], stops[1], stops[2]);
    }

    /// <summary>An accepted row with its invitation and an open browser session whose token the test knows.</summary>
    private static async Task<TestViewer> Viewer(World w, string name, string rowType = "INDIVIDUAL")
    {
        var invitation = await w.AddAcceptedViewer(name);
        Guid row;
        await using (var db = w.H.Context())
        {
            row = await db.Invitations.AsNoTracking().Where(i => i.Id == invitation).Select(i => i.RosterRowId).SingleAsync();
            await db.RosterRows.Where(r => r.Id == row).ExecuteUpdateAsync(set => set.SetProperty(r => r.RowType, rowType));
        }
        return new(row, invitation, await Session(w, invitation));
    }

    /// <summary>Ends any open session of the invitation and opens a new one, as a reload with a re-issued code would.</summary>
    private static async Task<string> Session(World w, Guid invitation)
    {
        var token = Guid.NewGuid().ToString("N");
        await using var db = w.H.Context();
        await db.BrowserSessions.Where(s => s.InvitationId == invitation && s.EndedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.EndedAt, w.H.Start).SetProperty(s => s.EndReason, "LEFT"));
        db.Add(new BrowserSession
        {
            Id = Guid.NewGuid(), InvitationId = invitation, SessionTokenHash = w.H.Service<IInvitationCodeService>().Hash("browser-session:" + token),
            CreatedAt = w.H.Start.AddMinutes(-30), ExpiresAt = w.H.Start.AddHours(1)
        });
        await db.SaveChangesAsync();
        return token;
    }

    private static Task<TourBallotView> Vote(World w, string token, Guid visitId, Guid stopId) =>
        w.H.Send(new CastStudentVoteCommand(w.H.TourId, token, visitId, stopId));

    private static Task<ConflictException> VoteRefused(World w, string token, Guid visitId, Guid stopId) =>
        Assert.ThrowsAsync<ConflictException>(() => Vote(w, token, visitId, stopId));

    private static Task<TourMutationResult> Lock(World w, Guid stopId, string reason) =>
        w.H.Send(new LockTourStopCommand(w.H.TourId, stopId, w.H.OperatorId, true, reason));

    private static Task<ConflictException> LockRefused(World w, Guid stopId) =>
        Assert.ThrowsAsync<ConflictException>(() => Lock(w, stopId, "Thử khóa"));

    private static async Task ArriveAtFirst(World w)
    {
        await Start(w);
        await Arrive(w);
    }

    private static async Task Arrive(World w)
    {
        await Result(w, await Delivered(w), "TERMINAL", "ARRIVED");
        await w.Report();
    }

    private static async Task Next(World w)
    {
        await w.Report();
        await w.H.Send(new NextTourStopCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version())));
    }

    private static async Task Skip(World w)
    {
        await w.Report();
        await w.H.Send(new SkipTourStopCommand(w.H.TourId, w.H.OperatorId, new(Guid.NewGuid(), await w.H.Version())));
    }

    private static async Task<TourStopVisit> CurrentVisit(World w)
    {
        await using var db = w.H.Context();
        var visitId = await db.Tours.AsNoTracking().Where(t => t.Id == w.H.TourId).Select(t => t.CurrentStopVisitId).SingleAsync();
        return await db.TourStopVisits.AsNoTracking().SingleAsync(v => v.Id == visitId);
    }

    private static async Task<TourStopVisit> Visit(World w, Guid id)
    {
        await using var db = w.H.Context();
        return await db.TourStopVisits.AsNoTracking().SingleAsync(v => v.Id == id);
    }

    private static async Task<List<TourEvent>> Events(World w, string type)
    {
        await using var db = w.H.Context();
        return await db.TourEvents.AsNoTracking().Where(e => e.TourId == w.H.TourId && e.EventType == type).OrderBy(e => e.Id).ToListAsync();
    }
}
