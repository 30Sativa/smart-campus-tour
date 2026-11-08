using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartCampus.Application.Common.Exceptions;
using SmartCampus.Application.Features.Accounts.Commands.DeactivateAccount;
using SmartCampus.Application.Features.Invitations.Commands.AccessTour;
using SmartCampus.Application.Features.RegistrationReview.Queries.ListRegistrations;
using SmartCampus.Application.Features.Registrations;
using SmartCampus.Application.Features.Representative.Commands.ResubmitRegistration;
using SmartCampus.Application.Features.Representative.Commands.SubmitRegistration;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistration;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeRegistrations;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTour;
using SmartCampus.Application.Features.Representative.Queries.GetRepresentativeTours;
using SmartCampus.Application.Features.RosterEmailCorrection.Commands;
using SmartCampus.Application.Features.Routes;
using SmartCampus.Application.Features.Tours;
using SmartCampus.Application.Features.Tours.Commands.ChangeTourCapacity;
using SmartCampus.Application.Features.Tours.Commands.ChangeTourOperator;
using SmartCampus.Application.Features.Tours.Commands.DeliverRosterExpiryNotice;
using SmartCampus.Application.Features.Tours.Commands.ExpirePendingDecisions;
using SmartCampus.Domain.Entities;

namespace SmartCampus.IntegrationTests;

/// <summary>ADR-0048: seats, Operator change, deactivation guard, T-24h expiry, the code guard and the Representative list.</summary>
public sealed class TourCapacityAndExpirySqlTests
{
    [SchemaV11Fact]
    public async Task TwoRegistrationsRacingForTheLastSeat_OnlyOneGetsIt()
    {
        for (var round = 0; round < 2; round++)
        {
            await using var w = await World.Create();
            await w.SetCapacity(2);
            var holder = await w.Representative("holder");
            await w.AddRegistration(holder, "PENDING", "held@example.test");
            var (a, b) = (await w.Representative("a"), await w.Representative("b"));
            var version = await w.H.Version();

            var first = Capture(() => w.Submit(a, "a@example.test", version));
            var second = Capture(() => w.Submit(b, "b@example.test", version));
            var errors = new[] { await first, await second };

            var refusal = Assert.IsType<ConflictException>(Assert.Single(errors, error => error is not null));
            Assert.Equal("TOUR_CAPACITY_EXCEEDED", refusal.Code);
            Assert.Equal(["0"], refusal.FieldErrors!["remainingSeats"]);
            Assert.Equal(2, await w.HeldSeats());
        }
    }

    [SchemaV11Fact]
    public async Task ARejectedRow_GivesItsSeatBack()
    {
        await using var w = await World.Create();
        await w.SetCapacity(1);
        var holder = await w.Representative("holder");
        await w.AddRegistration(holder, "PENDING", "held@example.test");
        var late = await w.Representative("late");
        var version = await w.H.Version();
        var refused = await Assert.ThrowsAsync<ConflictException>(() => w.Submit(late, "late@example.test", version));
        Assert.Equal("TOUR_CAPACITY_EXCEEDED", refused.Code);

        await w.H.Database.ExecuteAsync("UPDATE dbo.RosterRows SET ParticipationState = 'REJECTED';");
        await w.Submit(late, "late@example.test", version);
        Assert.Equal(1, await w.HeldSeats());
    }

    [SchemaV11Fact]
    public async Task Capacity_CannotGoBelowTheHeldSeats_OrAboveTheConfiguredMaximum()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("holder");
        await w.AddRegistration(representative, "ACCEPTED", "one@example.test");
        await w.AddRegistration(await w.Representative("second"), "PENDING", "two@example.test");

        var below = await Assert.ThrowsAsync<ConflictException>(() => w.ChangeCapacity(1));
        Assert.Equal("CAPACITY_BELOW_HELD", below.Code);
        await Assert.ThrowsAsync<ValidationException>(() => w.ChangeCapacity(21));

        var requestId = Guid.NewGuid();
        var version = await w.H.Version();
        await w.H.Send(new ChangeTourCapacityCommand(w.H.TourId, w.H.StaffId, new(requestId, version, 2)));
        // The same request is a replay: nothing changes and no second receipt appears.
        await w.H.Send(new ChangeTourCapacityCommand(w.H.TourId, w.H.StaffId, new(requestId, version, 2)));
        Assert.Equal(2, (await w.H.Detail()).Tour.Capacity);
        Assert.Equal(2, (await w.H.Detail()).Tour.HeldSeats);
        Assert.Equal(1, await w.Count(TourLifecycleEvents.CapacityChanged));
    }

    [SchemaV11Fact]
    public async Task ChangingCapacity_AfterStart_IsRefused()
    {
        await using var w = await World.Create();
        await w.H.Database.ExecuteAsync("UPDATE dbo.Tours SET State = 'RUNNING', StartedAt = SYSDATETIMEOFFSET();");
        var refused = await Assert.ThrowsAsync<ConflictException>(() => w.ChangeCapacity(10));
        Assert.Equal("TOUR_LOCKED", refused.Code);
    }

    [SchemaV11Fact]
    public async Task ChangingTheOperator_KeepsReady_AndNeedsAnActiveStaffAccount()
    {
        await using var w = await World.Create();
        await w.H.Database.ExecuteAsync("UPDATE dbo.Tours SET State = 'READY';");

        await Assert.ThrowsAsync<ConflictException>(() => w.ChangeOperator(w.H.TechnicalId));
        await w.ChangeOperator(w.H.StaffId);

        var detail = await w.H.Detail();
        Assert.Equal("READY", detail.Tour.State);
        Assert.Equal(w.H.StaffId, detail.Operator!.UserId);
        Assert.Equal(1, await w.Count(TourLifecycleEvents.OperatorChanged));

        await w.H.Database.ExecuteAsync("UPDATE dbo.Tours SET State = 'RUNNING', StartedAt = SYSDATETIMEOFFSET();");
        var locked = await Assert.ThrowsAsync<ConflictException>(() => w.ChangeOperator(w.H.OperatorId));
        Assert.Equal("TOUR_LOCKED", locked.Code);
    }

    [SchemaV11Fact]
    public async Task Deactivation_IsBlocked_WhileTheOperatorOrRepresentativeIsStillNeeded()
    {
        await using var w = await World.Create();
        var admin = await w.H.Database.InsertUserAsync(true, username: "cap.admin", roles: ["ADMIN"]);

        var operatorBlocked = await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new DeactivateAccountCommand(w.H.OperatorId, admin.Id)));
        Assert.Equal("ACCOUNT_IN_USE", operatorBlocked.Code);
        Assert.Contains("Tour READY", Assert.Single(operatorBlocked.Blockers!).Message);

        await w.ChangeOperator(w.H.StaffId);
        await w.H.Send(new DeactivateAccountCommand(w.H.OperatorId, admin.Id));
        await using (var db = w.H.Context())
            Assert.False(await db.Users.AsNoTracking().Where(u => u.Id == w.H.OperatorId).Select(u => u.IsActive).SingleAsync());

        var representative = await w.Representative("blocked");
        await w.AddRegistration(representative, "ACCEPTED", "row@example.test");
        var representativeBlocked = await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new DeactivateAccountCommand(representative, admin.Id)));
        Assert.Equal("ACTIVE_REGISTRATION", Assert.Single(representativeBlocked.Blockers!).Code);

        await w.H.Database.ExecuteAsync("UPDATE dbo.Tours SET State = 'CANCELLED', EndedAt = SYSDATETIMEOFFSET(), EndReason = N'Huỷ';");
        await w.H.Send(new DeactivateAccountCommand(representative, admin.Id));
    }

    [SchemaV11Fact]
    public async Task AtT24_PendingItemsExpire_OneMinuteEarlierTheyDoNot_AndASecondRunChangesNothing()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("expiry");
        var registration = await w.AddRegistration(representative, "PENDING", "pending@example.test");
        var accepted = await w.AddRow(registration, 2, "ACCEPTED", "accepted@example.test");
        await w.AddEmailChange(accepted, representative, "accepted@example.test", "next@example.test");
        Assert.Contains((await w.H.Detail()).Permissions.ReadyBlockers!, blocker => blocker.Code == "PENDING_DECISIONS");

        var mark = w.H.Start.AddHours(-24);
        w.Clock.Now = mark.AddMinutes(-1);
        Assert.Empty(await w.H.Send(new ListToursWithExpirableDecisionsQuery()));
        Assert.Equal(0, await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId)));
        Assert.Equal(2, await w.HeldSeats());

        w.Clock.Now = mark;
        Assert.Equal([w.H.TourId], await w.H.Send(new ListToursWithExpirableDecisionsQuery()));
        Assert.Equal(2, await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId)));

        await using (var db = w.H.Context())
        {
            var rows = await db.RosterRows.AsNoTracking().OrderBy(r => r.RowNumber).ToArrayAsync();
            Assert.Equal(["EXPIRED", "ACCEPTED"], rows.Select(r => r.ParticipationState));
            Assert.Equal("accepted@example.test", rows[1].Email);
            Assert.Equal("EXPIRED", await db.RosterEmailChangeRequests.AsNoTracking().Select(r => r.State).SingleAsync());
        }
        Assert.Equal(1, await w.HeldSeats());
        Assert.DoesNotContain((await w.H.Detail()).Permissions.ReadyBlockers!, blocker => blocker.Code == "PENDING_DECISIONS");

        Assert.Empty(await w.H.Send(new ListToursWithExpirableDecisionsQuery()));
        Assert.Equal(0, await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId)));
        Assert.Equal(1, await w.Count(RosterExpiryNoticeAudit.Expired));
        Assert.Equal(1, await w.Count(RosterExpiryNoticeAudit.Requested));
    }

    [SchemaV11Fact]
    public async Task AllPendingRegistration_IsRejectedBySystem_AtT24_WithAuditCountsOnly_AndLeavesTheStaffQueue()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("all.pending");
        var registration = await w.AddRegistration(representative, "PENDING", "first@example.test");
        await w.AddRow(registration, 2, "PENDING", "second@example.test");
        var queued = await w.H.Send(new ListRegistrationsQuery(new(State: RegistrationStates.Submitted)));
        Assert.Equal(registration, Assert.Single(queued.Items).Id);

        var mark = w.H.Start.AddHours(-24);
        w.Clock.Now = mark;
        Assert.Equal(2, await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId)));

        var stored = await w.Registration(registration);
        Assert.Equal(RegistrationStates.Rejected, stored.State);
        Assert.Equal("Hết hạn duyệt trước giờ tham quan 24 giờ.", stored.RejectionReason);
        Assert.Null(stored.ReviewedByUserId);
        Assert.Equal(mark, stored.ReviewedAt);
        Assert.Equal(mark, stored.UpdatedAt);
        await using (var db = w.H.Context())
        {
            var audit = await db.AuditLogs.AsNoTracking().SingleAsync(a => a.Action == RegistrationExpiry.AuditAction);
            Assert.Null(audit.ActorUserId);
            Assert.Equal(registration.ToString("D"), audit.EntityId);
            Assert.Equal("""{"expiredRows":2}""", audit.DataJson);
        }
        Assert.Empty((await w.H.Send(new ListRegistrationsQuery(new(State: RegistrationStates.Submitted)))).Items);

        var detail = await w.H.Send(new GetRepresentativeRegistrationQuery(registration, representative));
        Assert.Equal(RegistrationExpiry.Reason, detail.RejectionReason);
        Assert.False(detail.AllowedActions.Edit.Allowed);
        Assert.False(detail.AllowedActions.Resubmit.Allowed);

        // The Tour is still SCHEDULED, but an expired registration belongs with the closed ones.
        Assert.Equal(registration, Assert.Single((await w.H.Send(new GetRepresentativeRegistrationsQuery(representative, new(Group: RegistrationGroups.Closed)))).Items).Id);
        Assert.Empty((await w.H.Send(new GetRepresentativeRegistrationsQuery(representative, new(Group: RegistrationGroups.Active)))).Items);
    }

    [SchemaV11Fact]
    public async Task ARegistrationWithAnAcceptedRow_StaysApproved_AtT24()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("one.accepted");
        var registration = await w.AddRegistration(representative, "ACCEPTED", "accepted@example.test", RegistrationStates.Approved);
        await w.AddRow(registration, 2, "PENDING", "pending@example.test");

        w.Clock.Now = w.H.Start.AddHours(-24);
        Assert.Equal(1, await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId)));

        var stored = await w.Registration(registration);
        Assert.Equal(RegistrationStates.Approved, stored.State);
        Assert.Null(stored.RejectionReason);
        Assert.Null(stored.ReviewedAt);
        Assert.Equal(0, await w.Count(RegistrationExpiry.AuditAction));
    }

    [SchemaV11Fact]
    public async Task ARegistrationWithARejectedRow_AndTheRestExpired_IsRejected_AtT24()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("one.rejected");
        var registration = await w.AddRegistration(representative, "REJECTED", "rejected@example.test");
        await w.AddRow(registration, 2, "PENDING", "pending@example.test");

        w.Clock.Now = w.H.Start.AddHours(-24);
        Assert.Equal(1, await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId)));

        var stored = await w.Registration(registration);
        Assert.Equal(RegistrationStates.Rejected, stored.State);
        Assert.Equal(RegistrationExpiry.Reason, stored.RejectionReason);
    }

    [SchemaV11Fact]
    public async Task RunningTheExpiryTwice_ChangesNothingFurther()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("twice");
        var registration = await w.AddRegistration(representative, "PENDING", "row@example.test");
        var mark = w.H.Start.AddHours(-24);
        w.Clock.Now = mark;
        await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId));
        var first = await w.Registration(registration);

        w.Clock.Now = mark.AddMinutes(1);
        Assert.Equal(0, await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId)));

        var second = await w.Registration(registration);
        Assert.Equal(first.RowVersion, second.RowVersion);
        Assert.Equal(mark, second.ReviewedAt);
        Assert.Equal(1, await w.Count(RegistrationExpiry.AuditAction));
    }

    [SchemaV11Fact]
    public async Task ResubmittingARejectedRegistration_IsRefusedFromT24_AndTheGateAgrees()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("resubmit");
        var registration = await w.AddRegistration(representative, "REJECTED", "row@example.test", RegistrationStates.Rejected);
        var mark = w.H.Start.AddHours(-24);

        w.Clock.Now = mark;
        var refused = await Assert.ThrowsAsync<ConflictException>(() => w.Resubmit(registration, representative));
        Assert.Equal("REGISTRATION_REVIEW_CLOSED", refused.Code);
        var gate = (await w.H.Send(new GetRepresentativeRegistrationQuery(registration, representative))).AllowedActions.Resubmit;
        Assert.False(gate.Allowed);
        Assert.Equal(refused.Message, gate.Reason);
        Assert.Equal(RegistrationStates.Rejected, (await w.Registration(registration)).State);

        w.Clock.Now = mark.AddMinutes(-1);
        Assert.True((await w.H.Send(new GetRepresentativeRegistrationQuery(registration, representative))).AllowedActions.Resubmit.Allowed);
        await w.Resubmit(registration, representative);
        Assert.Equal(RegistrationStates.Submitted, (await w.Registration(registration)).State);
    }

    [SchemaV11Fact]
    public async Task ARepresentativeWithAnExpiredRegistration_IsNoLongerAccountInUse()
    {
        await using var w = await World.Create();
        var admin = await w.H.Database.InsertUserAsync(true, username: "expiry.admin", roles: ["ADMIN"]);
        var representative = await w.Representative("expired");
        await w.AddRegistration(representative, "PENDING", "row@example.test");
        var blocked = await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new DeactivateAccountCommand(representative, admin.Id)));
        Assert.Equal("ACCOUNT_IN_USE", blocked.Code);

        w.Clock.Now = w.H.Start.AddHours(-24);
        await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId));

        await w.H.Send(new DeactivateAccountCommand(representative, admin.Id));
        await using var db = w.H.Context();
        Assert.False(await db.Users.AsNoTracking().Where(u => u.Id == representative).Select(u => u.IsActive).SingleAsync());
    }

    [SchemaV11Fact]
    public async Task TheOperatorOfARunningTour_CannotBeDeactivated_UntilItEnds()
    {
        await using var w = await World.Create();
        var admin = await w.H.Database.InsertUserAsync(true, username: "running.admin", roles: ["ADMIN"]);
        await w.H.Database.ExecuteAsync("UPDATE dbo.Tours SET State = 'RUNNING', StartedAt = SYSDATETIMEOFFSET();");

        var blocked = await Assert.ThrowsAsync<ConflictException>(() => w.H.Send(new DeactivateAccountCommand(w.H.OperatorId, admin.Id)));
        Assert.Equal("ACCOUNT_IN_USE", blocked.Code);
        var blocker = Assert.Single(blocked.Blockers!);
        Assert.Equal("TOUR_OPERATOR", blocker.Code);
        Assert.StartsWith("Đang vận hành Tour ", blocker.Message);
        Assert.EndsWith(". Chờ Tour kết thúc.", blocker.Message);

        await w.H.Database.ExecuteAsync("UPDATE dbo.Tours SET State = 'CANCELLED', EndedAt = SYSDATETIMEOFFSET(), EndReason = N'Huỷ';");
        await w.H.Send(new DeactivateAccountCommand(w.H.OperatorId, admin.Id));
    }

    [SchemaV11Fact]
    public async Task TheRegisterGate_RefusesAFullTour_AndAfterTheRegistrationClose()
    {
        await using var w = await World.Create();
        await w.SetCapacity(1);
        var viewer = await w.Representative("viewer");
        var close = w.H.Start.AddHours(-48);
        w.Clock.Now = close.AddMinutes(-1);
        var open = await w.H.Send(new GetRepresentativeTourQuery(w.H.TourId, viewer));
        Assert.True(open.Register.Allowed);
        Assert.Equal(1, open.RemainingSeats);

        await w.AddRegistration(await w.Representative("seat"), "PENDING", "seat@example.test");
        var full = await w.H.Send(new GetRepresentativeTourQuery(w.H.TourId, viewer));
        Assert.False(full.Register.Allowed);
        Assert.Equal("Tour đã đủ chỗ.", full.Register.Reason);
        var listedFull = Assert.Single((await w.H.Send(new GetRepresentativeToursQuery(viewer, new()))).Items);
        Assert.Equal("Tour đã đủ chỗ.", listedFull.Register.Reason);

        await w.SetCapacity(2);
        w.Clock.Now = close;
        var late = await w.H.Send(new GetRepresentativeTourQuery(w.H.TourId, viewer));
        Assert.False(late.Register.Allowed);
        Assert.Equal("Đã hết hạn đăng ký.", late.Register.Reason);

        await w.SetCapacity(1);
        Assert.Equal("Đã hết hạn đăng ký.", (await w.H.Send(new GetRepresentativeTourQuery(w.H.TourId, viewer))).Register.Reason);
    }

    [SchemaV11Fact]
    public async Task TheRepresentativeRegistrationResponses_CarryTheTourEndTimestamp()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("ended");
        var registration = await w.AddRegistration(representative, "ACCEPTED", "row@example.test", RegistrationStates.Approved);
        Assert.Null((await w.H.Send(new GetRepresentativeRegistrationQuery(registration, representative))).Summary.TourEndedAt);

        var ended = new DateTimeOffset(2026, 11, 8, 3, 0, 0, TimeSpan.Zero);
        await w.H.Database.ExecuteAsync($"UPDATE dbo.Tours SET State = 'CANCELLED', EndedAt = '{ended:O}', EndReason = N'Huỷ';");

        Assert.Equal(ended, (await w.H.Send(new GetRepresentativeRegistrationQuery(registration, representative))).Summary.TourEndedAt);
        var listed = Assert.Single((await w.H.Send(new GetRepresentativeRegistrationsQuery(representative, new()))).Items);
        Assert.Equal(ended, listed.TourEndedAt);
    }

    [SchemaV11Fact]
    public async Task TheExpiryNotice_IsOneEmailPerRegistration_WithCounts_AndIsNeverClaimedTwice()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("notice");
        var registration = await w.AddRegistration(representative, "PENDING", "first@example.test");
        await w.AddRow(registration, 2, "PENDING", "second@example.test");
        w.Clock.Now = w.H.Start.AddHours(-24);
        await w.H.Send(new ExpirePendingDecisionsCommand(w.H.TourId));

        await using var db = w.H.Context();
        var attempt = (await db.AuditLogs.AsNoTracking().SingleAsync(a => a.Action == RosterExpiryNoticeAudit.Requested)).CorrelationId!.Value;
        var email = Assert.Single(await w.H.Send(new ClaimRosterExpiryNoticeCommand(attempt, false)));
        Assert.Equal(registration, email.RegistrationId);
        Assert.Equal(2, email.ExpiredRows);
        Assert.Equal(0, email.ExpiredEmailChanges);

        Assert.Empty(await w.H.Send(new ClaimRosterExpiryNoticeCommand(attempt, false)));
        await w.H.Send(new RecordRosterExpiryNoticeResultCommand(attempt, 1, []));
        Assert.Empty(await w.H.Send(new ClaimRosterExpiryNoticeCommand(attempt, false)));
    }

    [SchemaV11Fact]
    public async Task AnEmailChangeRequest_IsRefusedFromT24()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("cutoff");
        var registration = await w.AddRegistration(representative, "ACCEPTED", "row@example.test");
        var mark = w.H.Start.AddHours(-24);

        w.Clock.Now = mark;
        var refused = await Assert.ThrowsAsync<ConflictException>(() => w.RequestEmailChange(registration, representative));
        Assert.Equal("EMAIL_CHANGE_CUTOFF", refused.Code);

        w.Clock.Now = mark.AddMinutes(-1);
        await w.RequestEmailChange(registration, representative);
    }

    [SchemaV11Fact]
    public async Task FiveWrongCodes_LockThatCodeAndIp_ForFifteenMinutes()
    {
        await using var w = await World.Create();
        w.Clock.Now = DateTimeOffset.UtcNow;
        Task Join(string ip) => w.H.Send(new AccessTourCommand(w.H.TourId, "join", "WRONG-CODE", null, null, ip));

        for (var attempt = 0; attempt < 5; attempt++)
            await Assert.ThrowsAsync<UnauthorizedException>(() => Join("10.0.0.1"));

        var locked = await Assert.ThrowsAsync<TooManyRequestsException>(() => Join("10.0.0.1"));
        Assert.Equal("INVITATION_CODE_LOCKED", locked.Code);
        Assert.Contains("15 phút", locked.Message);
        await Assert.ThrowsAsync<UnauthorizedException>(() => Join("10.0.0.2"));

        w.Clock.Now = w.Clock.Now.Value.AddMinutes(14);
        await Assert.ThrowsAsync<TooManyRequestsException>(() => Join("10.0.0.1"));
        w.Clock.Now = w.Clock.Now.Value.AddMinutes(1);
        await Assert.ThrowsAsync<UnauthorizedException>(() => Join("10.0.0.1"));
    }

    [SchemaV11Fact]
    public async Task TheRepresentativeList_DropsATourAtTheRegistrationClose_ButItsDetailStaysOpenForParticipants()
    {
        await using var w = await World.Create();
        var representative = await w.Representative("list");
        await w.AddRegistration(representative, "ACCEPTED", "row@example.test");
        var close = w.H.Start.AddHours(-48);

        w.Clock.Now = close.AddMinutes(-1);
        var open = Assert.Single((await w.H.Send(new GetRepresentativeToursQuery(representative, new()))).Items);
        Assert.Equal(20, open.Capacity);
        Assert.Equal(19, open.RemainingSeats);

        w.Clock.Now = close;
        Assert.Empty((await w.H.Send(new GetRepresentativeToursQuery(representative, new()))).Items);
        Assert.Equal(w.H.TourId, (await w.H.Send(new GetRepresentativeTourQuery(w.H.TourId, representative))).Id);
    }

    [SchemaV11Fact]
    public async Task ARoutePassedTheOldWay_IsInTheRerunQueue_UntilANewRunIsRecorded()
    {
        await using var w = await World.Create();
        Assert.Empty(await w.H.Send(new ListRouteRerunQueueQuery()));

        await w.H.Database.ExecuteAsync("UPDATE dbo.RouteTestRuns SET MeasurementBasis = NULL;");
        var queued = Assert.Single(await w.H.Send(new ListRouteRerunQueueQuery()));
        Assert.Equal(w.H.Route.RevisionId, queued.RevisionId);

        await w.H.Send(new RecordRouteTestRunCommand(w.H.TechnicalId, w.H.Route.RouteId, w.H.Route.RevisionId,
            new(Guid.NewGuid(), TourReadySqlTests.Robot, w.H.StaffId, "PASS", true, true, true, 260, null, "Chạy lại đạt.")));
        Assert.Empty(await w.H.Send(new ListRouteRerunQueueQuery()));
    }

    private static async Task<Exception?> Capture(Func<Task> action)
    {
        await Task.Yield();
        try { await action(); return null; }
        catch (Exception error) { return error; }
    }

    private sealed class World(TourReadySqlTests.Harness harness, TourStartPreflightSqlTests.MutableClock clock) : IAsyncDisposable
    {
        public TourReadySqlTests.Harness H => harness;
        public TourStartPreflightSqlTests.MutableClock Clock => clock;

        public static async Task<World> Create()
        {
            var clock = new TourStartPreflightSqlTests.MutableClock();
            return new(await TourReadySqlTests.Harness.Create(services => services.AddSingleton<TimeProvider>(clock)), clock);
        }

        public async Task<Guid> Representative(string name) =>
            (await H.Database.InsertUserAsync(true, username: $"rep.{name}", roles: ["SCHOOL_REPRESENTATIVE"])).Id;

        public async Task ChangeCapacity(int capacity) =>
            await H.Send(new ChangeTourCapacityCommand(H.TourId, H.StaffId, new(Guid.NewGuid(), await H.Version(), capacity)));

        public Task SetCapacity(int capacity) => H.Database.ExecuteAsync($"UPDATE dbo.Tours SET Capacity = {capacity};");

        public async Task ChangeOperator(Guid user) =>
            await H.Send(new ChangeTourOperatorCommand(H.TourId, H.StaffId, new(Guid.NewGuid(), await H.Version(), user)));

        public Task Submit(Guid representative, string email, string version) => H.Send(new SubmitRegistrationCommand(H.TourId, representative, Guid.NewGuid(),
            new RegistrationInput("THPT Thử", "Nhóm", "Liên hệ", "contact@example.test", version, [new RosterInput(1, "INDIVIDUAL", "Học sinh", email, null)])));

        public async Task<Guid> AddRegistration(Guid representative, string rowState, string email, string state = RegistrationStates.Submitted)
        {
            var id = Guid.NewGuid();
            await H.Database.ExecuteAsync($"""
                INSERT dbo.GroupRegistrations (Id, TourId, RepresentativeUserId, SchoolName, GroupName, ContactName, ContactEmail, State, SubmittedAt, CreatedAt)
                VALUES ('{id}', '{H.TourId}', '{representative}', N'THPT Thử', N'Nhóm', N'Liên hệ', N'contact@example.test', '{state}', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
                """);
            await AddRow(id, 1, rowState, email);
            return id;
        }

        public async Task<Guid> AddRow(Guid registration, int number, string state, string email)
        {
            var id = Guid.NewGuid();
            await H.Database.ExecuteAsync($"""
                INSERT dbo.RosterRows (Id, RegistrationId, RowNumber, RowType, DisplayName, Email, ParticipationState, IsActive, CreatedAt)
                VALUES ('{id}', '{registration}', {number}, 'INDIVIDUAL', N'Học sinh', N'{email}', '{state}', 1, SYSDATETIMEOFFSET());
                """);
            return id;
        }

        public Task AddEmailChange(Guid row, Guid requester, string current, string proposed) => H.Database.ExecuteAsync($"""
            INSERT dbo.RosterEmailChangeRequests (Id, RosterRowId, RequestId, CurrentEmail, ProposedEmail, RequestedByUserId, State, CreatedAt)
            VALUES (NEWID(), '{row}', NEWID(), N'{current}', N'{proposed}', '{requester}', 'PENDING', SYSDATETIMEOFFSET());
            """);

        public async Task RequestEmailChange(Guid registration, Guid representative)
        {
            await using var db = H.Context();
            var data = await db.RosterRows.AsNoTracking().Where(r => r.RegistrationId == registration)
                .Select(r => new { r.Id, Row = r.RowVersion, Group = r.Registration.RowVersion, Tour = r.Registration.Tour.RowVersion }).SingleAsync();
            await H.Send(new RequestRosterEmailChangeCommand(registration, data.Id, representative, new(Guid.NewGuid(), "next@example.test",
                RowVersionToken.Encode(data.Tour), RowVersionToken.Encode(data.Group), RowVersionToken.Encode(data.Row))));
        }

        public async Task<GroupRegistration> Registration(Guid id)
        {
            await using var db = H.Context();
            return await db.GroupRegistrations.AsNoTracking().SingleAsync(r => r.Id == id);
        }

        public async Task Resubmit(Guid registration, Guid representative)
        {
            await using var db = H.Context();
            var data = await db.RosterRows.AsNoTracking().Where(r => r.RegistrationId == registration)
                .Select(r => new { r.Id, r.Email, Group = r.Registration.RowVersion, Tour = r.Registration.Tour.RowVersion }).SingleAsync();
            await H.Send(new ResubmitRegistrationCommand(registration, representative, new(new RegistrationInput("THPT Thử", "Nhóm", "Liên hệ", "contact@example.test",
                RowVersionToken.Encode(data.Tour), [new RosterInput(1, "INDIVIDUAL", "Học sinh", data.Email, null, data.Id)]), RowVersionToken.Encode(data.Group))));
        }

        public async Task<int> HeldSeats()
        {
            await using var db = H.Context();
            return await db.RosterRows.CountAsync(r => r.IsActive && (r.ParticipationState == "PENDING" || r.ParticipationState == "ACCEPTED"));
        }

        public async Task<int> Count(string action)
        {
            await using var db = H.Context();
            return await db.AuditLogs.CountAsync(a => a.TourId == H.TourId && a.Action == action);
        }

        public ValueTask DisposeAsync() => H.DisposeAsync();
    }
}
